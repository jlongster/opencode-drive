const screen = { value: "Fake OpenCode" }
const endpoints = await resolveEndpoints()
if (process.env.OPENCODE_TEST_HOME) {
  await Bun.write(
    `${process.env.OPENCODE_TEST_HOME}/child.pid`,
    String(process.pid),
  )
  const launches = `${process.env.OPENCODE_TEST_HOME}/launches.txt`
  await Bun.write(
    launches,
    `${await Bun.file(launches)
      .text()
      .catch(() => "")}launch\n`,
  )
  await Bun.write(
    `${process.env.OPENCODE_TEST_HOME}/renderer.txt`,
    process.env.OPENCODE_DRIVE_RENDERER ?? "missing",
  )
}

const ui = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(new URL(endpoints.ui).port),
  fetch(request, server) {
    if (server.upgrade(request)) return
    return new Response("drive websocket", { status: 426 })
  },
  websocket: {
    message(socket, input) {
      const request = JSON.parse(String(input)) as {
        readonly id?: number
        readonly method: string
        readonly params?: unknown
      }
      const result = frontend(request.method, request.params)
      if (request.id !== undefined)
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }))
    },
  },
})

const backend = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(new URL(endpoints.backend).port),
  fetch(request, server) {
    if (server.upgrade(request)) return
    return new Response("drive websocket", { status: 426 })
  },
  websocket: {
    async message(socket, input) {
      const request = JSON.parse(String(input)) as {
        readonly id?: number
        readonly method: string
        readonly params?: unknown
      }
      const result =
        request.method === "llm.attach" ? { attached: true } : { ok: true }
      if (request.id !== undefined)
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }))
      if (request.method === "llm.attach") {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "llm.request",
            params: {
              id: "ex_mock",
              url: "https://api.openai.com/v1/chat/completions",
              body: {},
            },
          }),
        )
      }
      if (request.method === "llm.chunk" && process.env.OPENCODE_TEST_HOME) {
        await Bun.write(
          `${process.env.OPENCODE_TEST_HOME}/mock-response.json`,
          JSON.stringify(request.params),
        )
      }
    },
  },
})

await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve)
  process.once("SIGTERM", resolve)
  const lifetime = Number(process.argv[2])
  if (Number.isFinite(lifetime)) setTimeout(resolve, lifetime)
})
await Promise.all([ui.stop(true), backend.stop(true)])

function frontend(method: string, params: unknown) {
  if (method === "ui.screenshot")
    return "/tmp/opencode-drive-fake/screenshot.png"
  if (method === "ui.start-record") return { recording: true }
  if (method === "ui.end-record")
    return "/tmp/opencode-drive-fake/recording.gif"
  if (
    method === "ui.type" &&
    isRecord(params) &&
    typeof params.text === "string"
  )
    screen.value += `\n${params.text}`
  if (method === "ui.enter") screen.value += "\n[enter]"
  if (method === "trace.list" || method === "trace.export")
    return { records: [] }
  if (method === "trace.clear") return { cleared: true }
  return {
    screen: screen.value,
    focused: { editor: true },
    elements: [],
    actions: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function resolveEndpoints() {
  if (process.env.DRIVE_REGISTRY_DIR && process.env.OPENCODE_DRIVE !== "1") {
    const manifest = (await Bun.file(
      `${process.env.DRIVE_REGISTRY_DIR}/${process.env.OPENCODE_DRIVE}.json`,
    ).json()) as {
      readonly endpoints: { readonly ui: string; readonly backend: string }
    }
    return manifest.endpoints
  }
  return { ui: "ws://127.0.0.1:40900", backend: "ws://127.0.0.1:40950" }
}
