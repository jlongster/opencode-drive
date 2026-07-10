import { rm } from "node:fs/promises"
import { initializeInstance } from "../instance/instance.js"
import { checkScript } from "../script/tooling.js"

export async function check(file: string) {
  const artifacts = await initializeInstance()
  try {
    await checkScript(artifacts, file)
  } finally {
    await rm(artifacts, { recursive: true, force: true })
  }
}
