import { resolve } from "node:path"

export async function api() {
  process.stdout.write(await Bun.file(resolve(import.meta.dir, "..", "client", "protocol.types.ts")).text())
}
