import { resolveInstance, unregisterInstance } from "./registry.js"

export async function stop(name?: string) {
  const manifest = await resolveInstance(name ?? "default")
  if (!manifest.headless) throw new Error(`drive instance "${manifest.name}" is visible`)
  process.kill(manifest.pid, "SIGTERM")
  await Promise.race([waitForExit(manifest.pid), Bun.sleep(1_000)])
  if (alive(manifest.pid)) process.kill(manifest.pid, "SIGKILL")
  await waitForExit(manifest.pid)
  await unregisterInstance(manifest.name, manifest.pid)
  console.log("success")
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
