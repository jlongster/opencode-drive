import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { InstanceManifest } from "./types.js"

export async function runDriver(driver: string, manifest: InstanceManifest) {
  await mkdir(manifest.artifacts, { recursive: true })
  const child = Bun.spawn([
    process.execPath,
    resolve(import.meta.dir, "driver-runner.ts"),
    resolve(driver),
    manifest.name,
    manifest.endpoints.ui,
    manifest.endpoints.backend,
    manifest.artifacts,
  ], {
    cwd: process.cwd(),
    env: cleanEnv(process.env),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const status = await child.exited
  if (status !== 0) throw new Error(`driver exited with status ${status}`)
}

function cleanEnv(env: Readonly<Record<string, string | undefined>>) {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined))
}
