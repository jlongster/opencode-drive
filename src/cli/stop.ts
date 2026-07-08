import { request } from "./control.js"
import { resolveInstance } from "./registry.js"

export async function stop(name: string) {
  await request((await resolveInstance(name)).control, "stop")
  console.log("success")
}
