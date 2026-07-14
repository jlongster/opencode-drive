import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import {
  launchInstance,
  type ProcessAdapter,
} from "../instance/instance.js"
import type { UiViewport } from "../script/types.js"
import { error, type OpenCodeDriverError } from "./error.js"
import type { Project } from "./project.js"

type LegacyInstance = Awaited<ReturnType<typeof launchInstance>>
type LegacyClient = Awaited<ReturnType<LegacyInstance["launchClient"]>>

export interface Target {
  readonly command?: ReadonlyArray<string>
  readonly dev?: string
  readonly env?: Readonly<Record<string, string>>
  readonly visible?: boolean
}

export interface ServerProcess {
  readonly instance: LegacyInstance
  readonly endpoint: string
  readonly visible: boolean
}

export interface ClientOptions {
  readonly recording?: boolean
  readonly viewport?: UiViewport
}

export interface ClientProcess {
  readonly endpoint: string
  readonly recording: LegacyClient["recording"]
}

const server = Effect.fn("ProcessSpawner.server")(function* (
  project: Project,
  target: Target = {},
) {
  const processAdapter = yield* makeProcessAdapter
  const name = `library-${crypto.randomUUID().slice(0, 12)}`
  const instance = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        launchInstance({
          artifacts: project.artifacts,
          name,
          scripted: true,
          command: target.command,
          dev: target.dev,
          env: target.env,
          visible: target.visible,
          process: processAdapter,
        }),
      catch: (cause) => error("server.prepare", cause),
    }),
    (instance) =>
      Effect.tryPromise({
        try: () => instance.stop(),
        catch: (cause) => error("server.stop", cause),
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("OpenCode server cleanup failed", cause),
        ),
      ),
  )
  const launched = yield* Effect.tryPromise({
    try: () => instance.launchServer(),
    catch: (cause) => error("server.launch", cause),
  })
  return {
    instance,
    endpoint: launched.endpoints.backend,
    visible: target.visible ?? false,
  } satisfies ServerProcess
})

const client = Effect.fn("ProcessSpawner.client")(function* (
  process: ServerProcess,
  identity: string,
  options: ClientOptions = {},
) {
  if (process.visible && options.recording)
    return yield* Effect.fail(
      error(
        "client.launch",
        "recording requires a headless OpenCode client",
      ),
    )
  const processAdapter = yield* makeProcessAdapter
  const launched = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        process.instance.launchClient(
          identity,
          {
            record: options.recording,
            viewport: options.viewport,
          },
          processAdapter,
        ),
      catch: (cause) => error("client.launch", cause),
    }),
    (client) =>
      Effect.tryPromise({
        try: () => client.kill(),
        catch: (cause) => error("client.stop", cause),
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("OpenCode client cleanup failed", cause),
        ),
      ),
  )
  return {
    endpoint: launched.endpoints.ui,
    recording: launched.recording,
  } satisfies ClientProcess
})

export interface Interface {
  readonly server: (
    project: Project,
    target?: Target,
  ) => Effect.Effect<
    ServerProcess,
    OpenCodeDriverError,
    Scope.Scope
  >
  readonly client: (
    process: ServerProcess,
    identity: string,
    options?: ClientOptions,
  ) => Effect.Effect<
    ClientProcess,
    OpenCodeDriverError,
    Scope.Scope
  >
}

export class Service extends Context.Service<Service, Interface>()(
  "opencode-drive/ProcessSpawner",
) {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const fileSystem = yield* FileSystem.FileSystem
    return Service.of({
      server: (project, target) =>
        server(project, target).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            spawner,
          ),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        ),
      client: (process, identity, options) =>
        client(process, identity, options).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            spawner,
          ),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        ),
    })
  }),
)

const makeProcessAdapter = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const fileSystem = yield* FileSystem.FileSystem
  const scope = yield* Scope.Scope
  return {
    spawn: async (command, options) => {
      const executable = command[0]
      if (executable === undefined)
        throw new Error("cannot spawn an empty command")
      const spawned = await Effect.runPromise(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make(executable, command.slice(1), {
              cwd: options.cwd,
              env: options.env,
              extendEnv: false,
              stdin: options.stdin,
              stdout: options.stdout._tag === "inherit" ? "inherit" : "pipe",
              stderr: options.stderr._tag === "inherit" ? "inherit" : "pipe",
              killSignal: "SIGKILL",
            }),
          )
          const drains: Array<Fiber.Fiber<unknown, unknown>> = []
          if (options.stdout._tag === "file")
            drains.push(
              yield* Stream.run(
                handle.stdout,
                fileSystem.sink(options.stdout.path),
              ).pipe(Effect.forkScoped),
            )
          if (options.stderr._tag === "file")
            drains.push(
              yield* Stream.run(
                handle.stderr,
                fileSystem.sink(options.stderr.path),
              ).pipe(Effect.forkScoped),
            )
          return { handle, drains }
        }).pipe(Scope.provide(scope)),
      )
      const { drains, handle } = spawned
      let exitCode: number | null = null
      const exited = Effect.runPromise(
        handle.exitCode.pipe(
          Effect.map(Number),
          Effect.catch(() => Effect.succeed(1)),
        ),
      ).then(async (code) => {
        await Promise.all(
          drains.map((drain) => Effect.runPromise(Fiber.await(drain))),
        )
        exitCode = code
        return exitCode
      })
      return {
        exited,
        get exitCode() {
          return exitCode
        },
        kill: (signal: number | NodeJS.Signals = "SIGTERM") => {
          return Effect.runPromise(
            handle.kill({
              killSignal:
                signal === "SIGKILL" ? "SIGKILL" : "SIGTERM",
            }).pipe(
              Effect.timeoutOrElse({
                duration: 10,
                orElse: () => Effect.void,
              }),
            ),
          )
        },
      }
    },
  } satisfies ProcessAdapter
})

export * as ProcessSpawner from "./process-spawner.js"
