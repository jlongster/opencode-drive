import { join } from "node:path"
import { driveLogFile } from "../log.js"
import { resolveInstance } from "../instance/registry.js"

export async function logs(name?: string) {
  const manifest = await resolveInstance(name)
  console.log(
    [
      join(manifest.artifacts, "logs", "opencode", "log", "opencode*.log"),
      driveLogFile(manifest.artifacts),
    ].join("\n"),
  )
}
