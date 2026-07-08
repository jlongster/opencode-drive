import { mkdir, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export interface InstanceManifest {
  readonly version: 1
  readonly name: string
  readonly pid: number
  readonly artifacts: string
  readonly visible: boolean
  readonly endpoints: { readonly ui: string; readonly backend: string }
  readonly control: string
}

export function registryDirectory() {
  return (
    process.env.DRIVE_REGISTRY_DIR ??
    join(homedir(), ".local", "state", "opencode-drive", "instances")
  )
}

export function manifestPath(name: string) {
  return join(registryDirectory(), `${validateName(name)}.json`)
}

export function controlPath(name: string) {
  return join(registryDirectory(), `${validateName(name)}.sock`)
}

export async function register(manifest: InstanceManifest) {
  await mkdir(registryDirectory(), { recursive: true })
  const existing = await read(manifest.name).catch(() => undefined)
  if (existing && alive(existing.pid))
    throw new Error(`drive instance "${manifest.name}" is already running`)
  await rm(manifest.control, { force: true })
  await Bun.write(
    manifestPath(manifest.name),
    `${JSON.stringify(manifest, undefined, 2)}\n`,
  )
}

export async function resolveInstance(name = "default") {
  const manifest = await read(name)
  if (!alive(manifest.pid)) {
    await unregister(name)
    throw new Error(`drive instance "${name}" is not running`)
  }
  return manifest
}

export async function unregister(name: string) {
  await Promise.all([
    rm(manifestPath(name), { force: true }),
    rm(controlPath(name), { force: true }),
  ])
}

async function read(name: string): Promise<InstanceManifest> {
  const value: unknown = await Bun.file(manifestPath(name))
    .json()
    .catch(() => undefined)
  if (!isManifest(value))
    throw new Error(`drive instance "${name}" was not found`)
  return value
}

function isManifest(value: unknown): value is InstanceManifest {
  if (typeof value !== "object" || value === null) return false
  if (!("version" in value) || value.version !== 1) return false
  if (!("name" in value) || typeof value.name !== "string") return false
  if (!("pid" in value) || typeof value.pid !== "number") return false
  if (!("artifacts" in value) || typeof value.artifacts !== "string")
    return false
  if (!("visible" in value) || typeof value.visible !== "boolean") return false
  if (!("control" in value) || typeof value.control !== "string") return false
  if (
    !("endpoints" in value) ||
    typeof value.endpoints !== "object" ||
    value.endpoints === null
  )
    return false
  return (
    "ui" in value.endpoints &&
    typeof value.endpoints.ui === "string" &&
    "backend" in value.endpoints &&
    typeof value.endpoints.backend === "string"
  )
}

function validateName(name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name))
    throw new Error(`invalid instance name "${name}"`)
  return name
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
