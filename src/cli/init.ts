import { initializeInstance } from "../instance/instance.js"
import { initializeManifest } from "../instance/registry.js"
import { logSuccess } from "./log.js"

export async function init(name: string) {
  logSuccess(`initializing ${name}`)
  const manifest = await initializeManifest(name, process.cwd(), initializeInstance)
  logSuccess(`initialized ${name}`)
  console.log(manifest.artifacts)
}
