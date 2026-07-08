import { rm } from "node:fs/promises"
import { connect, createServer } from "node:net"

export async function listenControl(
  path: string,
  handlers: {
    readonly restart: () => Promise<void>
    readonly stop: () => Promise<void>
  },
) {
  const server = createServer((socket) => {
    socket.setEncoding("utf8")
    socket.once("data", (data) => {
      const command = String(data).trim()
      const handler =
        command === "restart"
          ? handlers.restart
          : command === "stop"
            ? handlers.stop
            : undefined
      socket.destroy()
      if (!handler) return
      void handler().catch((error) => {
        console.error(
          `error: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    })
  })
  await listen(server, path)
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(path, { force: true })
  }
}

export function request(path: string, command: "restart" | "stop") {
  return new Promise<void>((resolve, reject) => {
    const socket = connect(path)
    socket.on("connect", () => socket.end(`${command}\n`, resolve))
    socket.on("error", () =>
      reject(new Error("instance control socket is unavailable")),
    )
  })
}

async function listen(server: ReturnType<typeof createServer>, path: string) {
  await rm(path, { force: true })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(path, () => {
      server.off("error", reject)
      resolve()
    })
  })
}
