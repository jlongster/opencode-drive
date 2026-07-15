import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { NodeServices } from "@effect/platform-node"
import * as OpenCodeInstance from "../instance/runtime.js"
import * as SimulationConnector from "../simulation/connector.js"
import * as OpenCodeClient from "./client.js"
import { error, type OpenCodeDriverError } from "./error.js"
import type {
  Driver,
  Llm,
  Settlement,
} from "./index.js"
import type {
  LlmControllerError,
  LlmSettlementError,
} from "./llm-controller.js"
import * as OpenCodeServer from "./server.js"
import * as SharedEffect from "./shared.js"
import type * as OpenCodeUi from "./ui.js"
import * as ReportCollector from "./report-collector.js"
import { Compatibility } from "./report.js"
import type { EndpointCompatibility } from "../simulation/connector.js"

export interface Options {
  readonly visible?: boolean
  readonly client?: OpenCodeClient.Options
  readonly launch?: "automatic" | "manual"
  readonly clientName?: string
  readonly artifactsRetained?: boolean
}

export interface Prepared {
  readonly driver: Driver | undefined
  readonly primary: OpenCodeClient.Client | undefined
  readonly llm: Llm
  readonly clients: OpenCodeClient.Clients
  readonly server: Pick<OpenCodeServer.Server, "launch" | "kill">
  readonly artifacts: string
  readonly finish: Driver["finish"]
  readonly settle: Driver["settle"]
  readonly failure: Effect.Effect<never, LlmControllerError | OpenCodeDriverError>
  readonly unexpectedClientExit: OpenCodeClient.Control["unexpectedExit"]
}

export const makeWithServices = Effect.fn("OpenCodeDriver.makePreparedWithServices")(
  function* (
    instance: OpenCodeInstance.Instance,
    options: Options = {},
  ) {
    const startedAt = Date.now()
    const server = yield* OpenCodeServer.make({
      instance,
      target: { visible: options.visible },
    })
    if ((options.launch ?? "automatic") === "automatic") yield* server.launch()
    const primary = (options.launch ?? "automatic") === "automatic"
      ? options.clientName === undefined
        ? yield* server.clients.make(options.client)
        : yield* server.clients.launch(options.clientName, options.client)
      : undefined
    const complete = (
      clients: Effect.Effect<
        ReadonlyArray<string>,
        OpenCodeDriverError | OpenCodeUi.OperationError
      >,
    ) =>
      Effect.gen(function* () {
        const llm = yield* Effect.exit(server.llm.settle())
        const shutdown = yield* Effect.exit(server.llm.shutdown())
        const clientExit = yield* Effect.exit(clients)
        let failure: Cause.Cause<
          | LlmControllerError
          | LlmSettlementError
          | OpenCodeDriverError
          | OpenCodeUi.OperationError
        > | undefined
        if (Exit.isFailure(llm)) failure = llm.cause
        if (Exit.isFailure(shutdown))
          failure = failure === undefined
            ? shutdown.cause
            : Cause.combine(failure, shutdown.cause)
        if (Exit.isFailure(clientExit))
          failure = failure === undefined
            ? clientExit.cause
            : Cause.combine(failure, clientExit.cause)
        if (failure !== undefined) return yield* Effect.failCause(failure)
        const compatibility = [
          ...(yield* server.compatibility),
          ...(yield* server.clients.compatibility),
        ]
        const recordings = Exit.isSuccess(clientExit) ? clientExit.value : []
        const endedAt = Date.now()
        const report = yield* ReportCollector.collect({
            artifactRoot: instance.artifacts,
            artifactsRetained: options.artifactsRetained ?? true,
            timing: {
              startedAt: new Date(startedAt).toISOString(),
              endedAt: new Date(endedAt).toISOString(),
              durationMs: endedAt - startedAt,
            },
            outcome: { _tag: "Succeeded" },
            compatibility: compatibility.map(reportCompatibility),
            screenshotPaths: [],
            recordingPaths: recordings,
          }).pipe(
            Effect.provide(NodeServices.layer),
            Effect.mapError((cause) => error("report.collect", cause)),
          )
        return { recordings, report } satisfies Settlement
})

function reportCompatibility(
  compatibility: EndpointCompatibility,
): Compatibility {
  return compatibility._tag === "Negotiated"
    ? Compatibility.cases.Negotiated.make({
        role: compatibility.role,
        protocolVersion: compatibility.protocolVersion,
        opencodeVersion: compatibility.server.version,
        capabilities: compatibility.capabilities,
      })
    : Compatibility.cases.Legacy.make({ role: compatibility.role })
}
    const finish = yield* SharedEffect.make(
      complete(server.clients.finish().pipe(Effect.as([]))),
    )
    const settle = yield* SharedEffect.make(complete(server.clients.settle()))
    yield* Effect.addFinalizer(() => server.llm.shutdown())
    const llm: Llm = {
      queue: server.llm.queue,
      send: server.llm.send,
      serve: server.llm.serve,
      title: server.llm.title,
      settle: server.llm.settle,
    }
    const driver: Driver | undefined = primary === undefined
      ? undefined
      : {
          ui: primary.ui,
          llm,
          clients: server.clients,
          artifacts: instance.artifacts,
          finish: () => finish.pipe(Effect.asVoid),
          settle: () => settle,
          ...(primary.recording === undefined
            ? {}
            : { recording: primary.recording }),
        }
    return {
      driver,
      primary,
      llm,
      clients: server.clients,
      server,
      artifacts: instance.artifacts,
      finish: () => finish.pipe(Effect.asVoid),
      settle: () => settle,
      failure: Effect.raceFirst(
        server.failure,
        server.clients.unexpectedExit.pipe(
          Effect.flatMap(({ name, status }) =>
            Effect.fail(
              error(
                "client.exit",
                `OpenCode client "${name}" exited with status ${status}`,
              ),
            ),
          ),
        ),
      ),
      unexpectedClientExit: server.clients.unexpectedExit,
    } satisfies Prepared
  },
)

export const make = (
  instance: OpenCodeInstance.Instance,
  options: Options = {},
) =>
  makeWithServices(instance, options).pipe(
    Effect.provide(SimulationConnector.layer),
  )
