import { request } from "../instance/control.js"
import { resolveInstance } from "../instance/registry.js"

export async function restart(name?: string) {
  const recording = await request((await resolveInstance(name)).control, "restart")
  console.log(recording ?? "success")
}
