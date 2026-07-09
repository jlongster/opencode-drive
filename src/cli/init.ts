import { initializeInstance } from "../instance/instance.js"
import { initializeManifest } from "../instance/registry.js"

export async function init(name: string) {
  const manifest = await initializeManifest(name, process.cwd(), initializeInstance)
  console.log(manifest.artifacts)
}
