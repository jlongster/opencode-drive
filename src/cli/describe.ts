import { resolveInstance } from "./registry.js"

export async function describe(name: string) {
  const manifest = await resolveInstance(name)
  console.log(
    [
      `PID: ${manifest.pid}`,
      `Visible: ${manifest.visible}`,
      `Artifacts: ${manifest.artifacts}`,
      `UI: ${manifest.endpoints.ui}`,
      `Backend: ${manifest.endpoints.backend}`,
      `Logs: ${manifest.artifacts}/logs`,
    ].join("\n"),
  )
}
