import { launchInstance } from "./instance.js"
import { connectMockBackend } from "./mock-backend.js"
import { runScript } from "./script.js"
import { listenControl } from "./control.js"
import {
  controlPath,
  register,
  resolveInstance,
  unregister,
} from "./registry.js"
import type { StartOptions } from "./types.js"

export async function start(options: StartOptions) {
  if (!options.visible && !options.script && !options.daemon)
    return startDetached(options)
  const instance = await launchInstance({
    name: options.name,
    command: options.command,
    dev: options.dev,
    state: options.state,
    scripted: options.script !== undefined,
    visible: options.visible,
  })
  await register({
    version: 1,
    name: options.name,
    pid: process.pid,
    artifacts: instance.artifacts,
    visible: options.visible,
    endpoints: instance.endpoints,
    control: controlPath(options.name),
  }).catch(async (error) => {
    await instance.stop()
    throw error
  })
  const interrupt = () => void instance.stop()
  let completed = false
  let current: ReturnType<typeof run> | undefined
  let restarting: Promise<void> | undefined
  let stopping = false
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const closeControl = await listenControl(controlPath(options.name), {
    restart: () => {
      if (restarting) return restarting
      restarting = (async () => {
        const previous = current
        previous?.abort.abort(new Error("script restarted"))
        await previous?.promise.catch(() => undefined)
        await instance.restart()
        current = run(options, instance)
        await current.ready
        await Bun.write(`${instance.artifacts}/ready`, "ready\n")
      })().finally(() => {
        restarting = undefined
      })
      return restarting
    },
    stop: async () => {
      stopping = true
      current?.abort.abort(new Error("opencode-drive stopped"))
      await instance.stop()
    },
  })
  try {
    current = run(options, instance)
    await current.ready
    await Bun.write(`${instance.artifacts}/ready`, "ready\n")
    if (options.visible) {
      const status = await instance.wait()
      if (status !== 0 && !stopping) process.exitCode = status
      return
    }
    while (true) {
      const active: NonNullable<typeof current> = current
      await active.promise
      if (stopping) break
      if (restarting) {
        await restarting
        continue
      }
      if (active !== current) continue
      completed = true
      break
    }
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    current?.abort.abort(new Error("opencode-drive stopped"))
    await closeControl()
    await instance.stop()
    await unregister(options.name)
    if (options.script && !options.visible)
      report(instance, completed ? "completed" : undefined)
  }
}

async function startDetached(options: StartOptions) {
  const existing = await resolveInstance(options.name).catch(() => undefined)
  if (existing)
    throw new Error(`drive instance "${options.name}" is already running`)
  const child = Bun.spawn(
    [
      process.execPath,
      process.argv[1]!,
      "start",
      "--daemon",
      "--name",
      options.name,
      ...(options.script ? ["--script", options.script] : []),
      ...(options.dev ? ["--dev", options.dev] : []),
      ...(options.state ? ["--state", options.state] : []),
      ...(options.command.length ? ["--", ...options.command] : []),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    },
  )
  child.unref()
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const manifest = await resolveInstance(options.name).catch(() => undefined)
    if (manifest && (await Bun.file(`${manifest.artifacts}/ready`).exists())) {
      report({
        artifacts: manifest.artifacts,
        logs: `${manifest.artifacts}/logs`,
      })
      return
    }
    if (child.exitCode !== null)
      throw new Error(`detached instance exited with status ${child.exitCode}`)
    await Bun.sleep(50)
  }
  throw new Error(`timed out starting drive instance "${options.name}"`)
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
            new Promise<void>((resolve) =>
              abort.signal.addEventListener("abort", () => resolve(), {
                once: true,
              }),
            ),
          ])
        }
        return
      }
      const mock = await connectMockBackend(instance.endpoints.backend)
      ready()
      abort.signal.addEventListener("abort", () => mock.close(), { once: true })
      const status = await Promise.race([
        child.exited,
        new Promise<number>((resolve) =>
          abort.signal.addEventListener("abort", () => resolve(0), {
            once: true,
          }),
        ),
      ])
      mock.close()
      if (status !== 0 && !abort.signal.aborted) process.exitCode = status
    })(),
  }
}

function report(
  instance: { readonly artifacts: string; readonly logs: string },
  status?: string,
) {
  if (status) console.error(`opencode-drive: ${status}`)
  console.error(`opencode-drive: artifacts ${instance.artifacts}`)
}
