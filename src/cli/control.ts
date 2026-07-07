import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connect, createServer } from "node:net"

const socketPath = join(
  process.env.XDG_RUNTIME_DIR ?? tmpdir(),
  "opencode-drive.sock",
)

export async function listenControl(onRestart: () => Promise<void>) {
  const server = createServer((socket) => {
    socket.setEncoding("utf8")
    socket.once("data", (data) => {
      if (String(data).trim() !== "restart") {
        socket.destroy()
        return
      }
      socket.destroy()
      void onRestart().catch((error) => {
        console.error(
          `error: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    })
  })
  await listen(server)
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(socketPath, { force: true })
  }
}

export function requestRestart() {
  return new Promise<void>((resolve, reject) => {
    const socket = connect(socketPath)
    socket.on("connect", () => {
      socket.end("restart\n", resolve)
    })
    socket.on("error", () =>
      reject(new Error("no running opencode-drive instance")),
    )
  })
}

async function listen(server: ReturnType<typeof createServer>) {
  const attempt = () =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(socketPath, () => {
        server.off("error", reject)
        resolve()
      })
    })
  try {
    await attempt()
  } catch (error) {
    if (!isAddressInUse(error) || (await active())) throw error
    await rm(socketPath, { force: true })
    await attempt()
  }
}

function active() {
  return new Promise<boolean>((resolve) => {
    const socket = connect(socketPath)
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
}

function isAddressInUse(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error && "code" in error && error.code === "EADDRINUSE"
  )
}
