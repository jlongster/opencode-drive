import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readdir, readlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const roots: string[] = []
const children: Bun.Subprocess[] = []

afterEach(async () => {
  children.splice(0).forEach((child) => child.kill("SIGKILL"))
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe("opencode-drive", () => {
  test("prints only the UI command protocol", async () => {
    const child = spawn(["api"])
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

  test("drives a headless instance on the default port", async () => {
    const running = spawn([
      "start",
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
      "1500",
    ])
    await waitForPort(40900)

    const command = spawn([
      "send",
      "--command.ui.type",
      '{"text":"connected"}',
      "--command.ui.screenshot",
    ])
    const [status, stdout] = await Promise.all([
      command.exited,
      new Response(command.stdout).text(),
    ])
    expect(status).toBe(0)
    expect(stdout).toBe("success\n")

    expect(await running.exited).toBe(0)
    const stderr = await new Response(running.stderr).text()
    const artifacts = artifactPath(stderr)
    roots.push(artifacts)
    expect(await readdir(join(artifacts, "state"))).toEqual(["files"])
    expect(await Bun.file(join(artifacts, "renderer.txt")).text()).toBe(
      "headless",
    )
    expect(
      await Bun.file(join(artifacts, "mock-response.json")).json(),
    ).toMatchObject({
      id: "ex_mock",
      items: [
        {
          type: "textDelta",
          text: "This is a sample response from opencode-drive.",
        },
      ],
    })
    expect(stderr).toContain(`opencode-drive: logs ${join(artifacts, "logs")}`)
  })

  test("renders the TUI when visible is requested", async () => {
    const running = spawn([
      "start",
      "--visible",
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
      "500",
    ])
    expect(await running.exited).toBe(0)
    expect(await new Response(running.stderr).text()).not.toContain(
      "opencode-drive:",
    )
  })

  test("does not restart a headless instance", async () => {
    const running = spawn([
      "start",
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
      "1000",
    ])
    await waitForPort(40900)
    const restarted = spawn(["restart"])
    expect(await restarted.exited).toBe(1)
    expect(await new Response(restarted.stderr).text()).toContain(
      "no running opencode-drive instance",
    )
    await running.exited
  })

  test("restarts a visible instance", async () => {
    const running = spawn([
      "start",
      "--visible",
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
    ])
    children.push(running)
    await waitForPort(40900)
    await waitForFile(join(tmpdir(), "opencode-drive.sock"))
    const artifacts = await processArtifacts(running.pid)
    roots.push(artifacts)

    const restarted = spawn(["restart"])
    expect(await restarted.exited).toBe(0)
    expect(await new Response(restarted.stdout).text()).toBe("success\n")
    await waitForLines(join(artifacts, "launches.txt"), 2)
    expect(
      (await Bun.file(join(artifacts, "launches.txt")).text())
        .trim()
        .split("\n"),
    ).toHaveLength(2)

    running.kill("SIGINT")
    await running.exited
    children.splice(children.indexOf(running), 1)
  })

  test("reruns a visible script on restart", async () => {
    const running = spawn([
      "start",
      "--visible",
      "--script",
      fixture("restart-script.ts"),
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
    ])
    children.push(running)
    const artifacts = await processArtifacts(running.pid)
    roots.push(artifacts)
    await waitForLines(join(artifacts, "script-runs.txt"), 1)

    expect(await spawn(["restart"]).exited).toBe(0)
    await waitForLines(join(artifacts, "script-runs.txt"), 2)

    running.kill("SIGINT")
    await running.exited
    children.splice(children.indexOf(running), 1)
  })

  test("sends commands directly to an externally started instance", async () => {
    const external = Bun.spawn(
      [process.execPath, fixture("fake-opencode.ts")],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      },
    )
    children.push(external)
    await waitForPort(40900)

    const state = spawn(["send", "--command.ui.state"])
    const [status, stdout] = await Promise.all([
      state.exited,
      new Response(state.stdout).text(),
    ])
    expect(status).toBe(0)
    expect(JSON.parse(stdout).focused.editor).toBe(true)
  })

  test("runs a script with connected clients and reports artifacts", async () => {
    const child = spawn([
      "start",
      "--script",
      fixture("script.ts"),
      "--",
      process.execPath,
      fixture("fake-opencode.ts"),
    ])
    const [status, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ])
    expect(status).toBe(0)
    const artifacts = artifactPath(stderr)
    roots.push(artifacts)
    expect(
      await Bun.file(join(artifacts, "script-result.json")).json(),
    ).toEqual({
      focused: { editor: true },
      attached: { attached: true },
    })
    expect(stderr).toContain("opencode-drive: completed")
    expect(stderr).toContain(`opencode-drive: logs ${join(artifacts, "logs")}`)
    expect(
      await Bun.file(join(artifacts, "logs", "opencode.stdout.log")).exists(),
    ).toBe(true)
    expect(
      await Bun.file(join(artifacts, "logs", "opencode.stderr.log")).exists(),
    ).toBe(true)
  })

  test("rejects removed names and LLM commands", async () => {
    const named = spawn(["send", "--name", "demo", "--command.ui.state"])
    const llm = spawn(["send", "--command.llm.pending"])
    expect(await named.exited).toBe(1)
    expect(await llm.exited).toBe(1)
  })
})

function spawn(args: ReadonlyArray<string>) {
  return Bun.spawn([process.execPath, resolve("src/cli/index.ts"), ...args], {
    cwd: resolve("."),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
}

function fixture(name: string) {
  return resolve("test", "fixtures", name)
}

async function waitForPort(port: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((done) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      socket.addEventListener(
        "open",
        () => {
          socket.close()
          done(true)
        },
        { once: true },
      )
      socket.addEventListener("error", () => done(false), { once: true })
    })
    if (connected) return
    await Bun.sleep(25)
  }
  throw new Error(`timed out waiting for port ${port}`)
}

function artifactPath(stderr: string) {
  const line = stderr
    .split("\n")
    .find((value) => value.startsWith("opencode-drive: artifacts "))
  if (!line) throw new Error("artifact path was not reported")
  return line.slice("opencode-drive: artifacts ".length)
}

async function processArtifacts(pid: number) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const child = Bun.spawnSync(["ps", "--ppid", String(pid), "-o", "pid="])
      .stdout.toString()
      .trim()
      .split(/\s+/)[0]
    if (child) {
      const cwd = await readlink(`/proc/${child}/cwd`).catch(() => undefined)
      if (cwd) return cwd
    }
    await Bun.sleep(25)
  }
  throw new Error("timed out locating artifacts")
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

async function waitForFile(file: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await Bun.file(file).exists()) return
    await Bun.sleep(25)
  }
  throw new Error(`timed out waiting for ${file}`)
}
