import { homedir } from "node:os"
import { join } from "node:path"

const manifest = await Bun.file(join(
  process.env.DRIVE_REGISTRY_DIR ?? join(homedir(), ".local", "state", "opencode-drive", "instances"),
  `${required("OPENCODE_DRIVE")}.json`,
)).json() as { readonly endpoints: { readonly ui: string; readonly backend: string } }
const screen = { value: "Fake OpenCode" }

const ui = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(new URL(manifest.endpoints.ui).port),
  fetch(request, server) {
    if (server.upgrade(request)) return
    return new Response("drive websocket", { status: 426 })
  },
  websocket: {
    message(socket, input) {
      const request = JSON.parse(String(input)) as { readonly id?: number; readonly method: string; readonly params?: unknown }
      const result = frontend(request.method, request.params)
      if (request.id !== undefined) socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }))
    },
  },
})

const backend = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(new URL(manifest.endpoints.backend).port),
  fetch(request, server) {
    if (server.upgrade(request)) return
    return new Response("drive websocket", { status: 426 })
  },
  websocket: {
    message(socket, input) {
      const request = JSON.parse(String(input)) as { readonly id?: number; readonly method: string }
      const result = request.method === "llm.pending" ? { exchanges: [] } : { ok: true }
      if (request.id !== undefined) socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }))
    },
  },
})

await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve)
  process.once("SIGTERM", resolve)
})
await Promise.all([ui.stop(true), backend.stop(true)])

function frontend(method: string, params: unknown) {
  if (method === "ui.screenshot") return "/tmp/opencode-drive-fake/screenshot.png"
  if (method === "ui.start-record") return { recording: true }
  if (method === "ui.end-record") return "/tmp/opencode-drive-fake/recording.gif"
  if (method === "ui.type" && isRecord(params) && typeof params.text === "string") screen.value += `\n${params.text}`
  if (method === "ui.enter") screen.value += "\n[enter]"
  if (method === "trace.list" || method === "trace.export") return { records: [] }
  if (method === "trace.clear") return { cleared: true }
  return {
    screen: screen.value,
    focused: { editor: true },
    elements: [],
    actions: [],
  }
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
