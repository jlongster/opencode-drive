import { launchInstance } from "./instance.js"
import { connectMockBackend } from "./mock-backend.js"
import { runScript } from "./script.js"
import { listenControl } from "./control.js"
import type { StartOptions } from "./types.js"

export async function start(options: StartOptions) {
  const instance = await launchInstance({
    command: options.command,
    dev: options.dev,
    state: options.state,
    scripted: options.script !== undefined,
    visible: options.visible,
  })
  const interrupt = () => void instance.stop()
  let completed = false
  let current: ReturnType<typeof run> | undefined
  let restarting: Promise<void> | undefined
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const closeControl = options.visible
    ? await listenControl(() => {
        if (restarting) return restarting
        restarting = (async () => {
          const previous = current
          previous?.abort.abort(new Error("script restarted"))
          await previous?.promise.catch(() => undefined)
          await instance.restart()
          current = run(options, instance)
          await current.ready
        })().finally(() => {
          restarting = undefined
        })
        return restarting
      })
    : undefined
  try {
    current = run(options, instance)
    if (options.visible) {
      const status = await instance.wait()
      if (status !== 0) process.exitCode = status
      return
    }
    while (true) {
      const active: NonNullable<typeof current> = current
      await active.promise
      if (active !== current) continue
      completed = true
      break
    }
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    current?.abort.abort(new Error("opencode-drive stopped"))
    await closeControl?.()
    await instance.stop()
    if (options.script && !options.visible)
      report(instance, completed ? "completed" : undefined)
  }
}

function run(
  options: StartOptions,
  instance: Awaited<ReturnType<typeof launchInstance>>,
) {
  const abort = new AbortController()
  const child = instance.child
  let ready!: () => void
  const readiness = new Promise<void>((resolve) => {
    ready = resolve
  })
  return {
    abort,
    ready: readiness,
    promise: (async () => {
      await instance.waitForDrive("both")
      if (options.script) {
        const script = runScript(
          options.script,
          instance.artifacts,
          instance.endpoints,
          abort.signal,
        )
        ready()
        await script
        if (options.visible) {
          await Promise.race([
            child.exited,
            new Promise<void>((resolve) => {
              abort.signal.addEventListener("abort", () => resolve(), {
                once: true,
              })
            }),
          ])
        }
        return
      }
      const mock = await connectMockBackend(instance.endpoints.backend)
      ready()
      abort.signal.addEventListener("abort", () => mock.close(), { once: true })
      if (!options.visible) report(instance)
      const status = await Promise.race([
        child.exited,
        new Promise<number>((resolve) => {
          abort.signal.addEventListener("abort", () => resolve(0), {
            once: true,
          })
        }),
      ])
      mock.close()
      if (status !== 0 && !abort.signal.aborted) process.exitCode = status
    })(),
  }
}

function report(
  instance: Awaited<ReturnType<typeof launchInstance>>,
  status?: string,
) {
  if (status) console.error(`opencode-drive: ${status}`)
  console.error(`opencode-drive: artifacts ${instance.artifacts}`)
  console.error(`opencode-drive: logs ${instance.logs}`)
}
