import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { restartInstance } from "./instance.js"
import { resolveInstance } from "./registry.js"

export async function restart(name?: string) {
  const manifest = await resolveInstance(name ?? "default")
  if (!manifest.headless) {
    await restartVisible(manifest)
    console.log("success")
    return
  }
  process.kill(manifest.pid, "SIGTERM")
  await Promise.race([waitForExit(manifest.pid), Bun.sleep(1_000)])
  if (alive(manifest.pid)) process.kill(manifest.pid, "SIGKILL")
  await waitForExit(manifest.pid)
  await restartInstance(manifest)
  console.log("success")
}

async function restartVisible(manifest: Awaited<ReturnType<typeof resolveInstance>>) {
  if (!(await Bun.file(join(manifest.artifacts, "launch.json")).exists())) {
    throw new Error(`drive instance "${manifest.name}" was started by a version that does not support restart`)
  }
  const token = randomUUID()
  const request = join(manifest.artifacts, "restart-request.json")
  const response = join(manifest.artifacts, "restart-response.json")
  await Bun.file(response).delete().catch(() => undefined)
  await Bun.write(request, `${JSON.stringify({ token })}\n`)
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const value = await Bun.file(response).json().catch(() => undefined)
    if (isRestartResponse(value) && value.token === token) {
      if (!value.success) throw new Error(value.error ?? "visible restart failed")
      return
    }
    if (!alive(manifest.pid)) throw new Error(`drive instance "${manifest.name}" exited while restarting`)
    await Bun.sleep(25)
  }
  throw new Error(`timed out restarting drive instance "${manifest.name}"`)
}

function isRestartResponse(value: unknown): value is {
  readonly token: string
  readonly success: boolean
  readonly error?: string
} {
  if (typeof value !== "object" || value === null) return false
  if (!("token" in value) || typeof value.token !== "string") return false
  return "success" in value && typeof value.success === "boolean"
}

function waitForExit(pid: number) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!alive(pid)) return resolve()
      setTimeout(check, 25)
    }
    check()
  })
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
