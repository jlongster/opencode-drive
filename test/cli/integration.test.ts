import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const roots: string[] = []
const instances: Array<{ root: string; name: string }> = []

afterEach(async () => {
  await Promise.all(
    instances.splice(0).map(async ({ root, name }) => {
      await spawn(["stop", "--name", name], root).exited
    }),
  )
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("opencode-drive", () => {
  test("prints only the UI command protocol", async () => {
    const root = await temporary()
    const child = spawn(["api"], root)
    const [status, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ])
    expect(status).toBe(0)
    expect(stdout).toBe(
      await Bun.file(resolve("src/client/protocol.types.ts")).text(),
    )
    expect(stdout).not.toContain("llm.")
  })

  test("starts, drives, describes, restarts, and stops a named detached instance", async () => {
    const root = await temporary()
    const name = "detached-test"
    const started = spawn(
      [
        "start",
        "--name",
        name,
        "--",
        process.execPath,
        fixture("fake-opencode.ts"),
      ],
      root,
    )
    const [startStatus, startError] = await Promise.all([
      started.exited,
      new Response(started.stderr).text(),
    ])
    expect(startStatus).toBe(0)
    expect(startError).toContain("opencode-drive: artifacts ")
    expect(startError).not.toContain(`opencode-drive: ${name}`)
    instances.push({ root, name })

    const manifest = await Bun.file(
      join(root, "registry", `${name}.json`),
    ).json()
    roots.push(manifest.artifacts)
    expect(manifest.visible).toBe(false)
    expect(manifest.endpoints.ui).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/)
    expect(manifest.endpoints.backend).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/)

    const state = spawn(["send", "--name", name, "--command.ui.state"], root)
    expect(await state.exited).toBe(0)
    expect(
      JSON.parse(await new Response(state.stdout).text()).focused.editor,
    ).toBe(true)

    const screenshot = spawn(
      ["send", "--name", name, "--command.ui.screenshot"],
      root,
    )
    expect(await screenshot.exited).toBe(0)
    expect(await new Response(screenshot.stdout).text()).toBe(
      "/tmp/opencode-drive-fake/screenshot.png\n",
    )

    const described = spawn(["describe", "--name", name], root)
    expect(await described.exited).toBe(0)
    expect(await new Response(described.stdout).text()).toContain(
      `UI: ${manifest.endpoints.ui}`,
    )

    const restarted = spawn(["restart", "--name", name], root)
    expect(await restarted.exited).toBe(0)
    await waitForLines(join(manifest.artifacts, "launches.txt"), 2)
    expect(
      await spawn(["send", "--name", name, "--command.ui.state"], root).exited,
    ).toBe(0)

    const stopped = spawn(["stop", "--name", name], root)
    expect(await stopped.exited).toBe(0)
    await waitForMissing(join(root, "registry", `${name}.json`))
    instances.splice(
      instances.findIndex((item) => item.name === name),
      1,
    )
  }, 30_000)

  test("rejects duplicate names", async () => {
    const root = await temporary()
    const name = "duplicate-test"
    const args = [
      "start",
      "--name",
      name,
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
    ]
    expect(await spawn(args, root).exited).toBe(0)
    instances.push({ root, name })
    const duplicate = spawn(args, root)
    const [status, stderr] = await Promise.all([
      duplicate.exited,
      new Response(duplicate.stderr).text(),
    ])
    expect(status).toBe(1)
    expect(stderr).toContain(`drive instance "${name}" is already running`)
  })

  test("runs multiple named instances concurrently", async () => {
    const root = await temporary()
    for (const name of ["first", "second"]) {
      expect(
        await spawn(
          [
            "start",
            "--name",
            name,
            "--",
            process.execPath,
            fixture("fake-opencode.ts"),
          ],
          root,
        ).exited,
      ).toBe(0)
      instances.push({ root, name })
    }
    const first = await Bun.file(join(root, "registry", "first.json")).json()
    const second = await Bun.file(join(root, "registry", "second.json")).json()
    roots.push(first.artifacts, second.artifacts)
    expect(first.endpoints.ui).not.toBe(second.endpoints.ui)
    expect(
      await spawn(["send", "--name", "first", "--command.ui.state"], root)
        .exited,
    ).toBe(0)
    expect(
      await spawn(["send", "--name", "second", "--command.ui.state"], root)
        .exited,
    ).toBe(0)
  })

  test("keeps visible instances in the foreground", async () => {
    const root = await temporary()
    const name = "visible-test"
    const running = spawn(
      [
        "start",
        "--visible",
        "--name",
        name,
        "--",
        process.execPath,
        fixture("fake-opencode.ts"),
        "500",
      ],
      root,
    )
    expect(await running.exited).toBe(0)
    expect(
      await Bun.file(join(root, "registry", `${name}.json`)).exists(),
    ).toBe(false)
  })

  test("runs scripts in the foreground and exits", async () => {
    const root = await temporary()
    const name = "script-test"
    const child = spawn(
      [
        "start",
        "--name",
        name,
        "--script",
        fixture("script.ts"),
        "--",
        process.execPath,
        fixture("fake-opencode.ts"),
      ],
      root,
    )
    const started = Date.now()
    const [status, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ])
    expect(status).toBe(0)
    expect(Date.now() - started).toBeLessThan(5_000)
    const artifacts = artifactPath(stderr)
    roots.push(artifacts)
    expect(await Bun.file(join(artifacts, "script-result.json")).exists()).toBe(
      true,
    )
    expect(
      running(Number(await Bun.file(join(artifacts, "child.pid")).text())),
    ).toBe(false)
    expect(
      await Bun.file(join(root, "registry", `${name}.json`)).exists(),
    ).toBe(false)
  })

  test("rejects removed LLM commands", async () => {
    const root = await temporary()
    expect(await spawn(["send", "--command.llm.pending"], root).exited).toBe(1)
  })
})

function spawn(args: ReadonlyArray<string>, root: string) {
  return Bun.spawn([process.execPath, resolve("src/cli/index.ts"), ...args], {
    cwd: resolve("."),
    env: { ...process.env, DRIVE_REGISTRY_DIR: join(root, "registry") },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
}

function fixture(name: string) {
  return resolve("test", "fixtures", name)
}

async function temporary() {
  const root = await mkdtemp(join(tmpdir(), "opencode-drive-test-"))
  roots.push(root)
  return root
}

async function waitForLines(file: string, count: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const lines = await Bun.file(file)
      .text()
      .then((text) => text.trim().split("\n").length)
      .catch(() => 0)
    if (lines >= count) return
    await Bun.sleep(25)
  }
  throw new Error(`timed out waiting for ${count} lines in ${file}`)
}

async function waitForMissing(file: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!(await Bun.file(file).exists())) return
    await Bun.sleep(25)
  }
  throw new Error(`timed out waiting for ${file} removal`)
}

function artifactPath(stderr: string) {
  const line = stderr
    .split("\n")
    .find((value) => value.startsWith("opencode-drive: artifacts "))
  if (!line) throw new Error("artifact path was not reported")
  return line.slice("opencode-drive: artifacts ".length)
}

function running(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
