import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import * as OpenCodeRpcProtocol from "./opencode-protocol.js"
import { Backend as BackendProtocol } from "./protocol.js"
import { BackendRpcs, UiRpcs } from "./rpc.js"
import type { SimulationRequestError } from "./rpc.js"

export class SimulationConnectionError extends Schema.TaggedErrorClass<SimulationConnectionError>()(
  "SimulationConnectionError",
  {
    endpoint: Schema.String,
    operation: Schema.String,
    message: Schema.String,
  },
) {}

export interface Options {
  readonly connectTimeout?: number
  readonly requestTimeout?: number
  readonly attach?: boolean
}

export type UiClient = RpcClient.FromGroup<
  typeof UiRpcs,
  RpcClientError.RpcClientError
>
export type BackendClient = RpcClient.FromGroup<
  typeof BackendRpcs,
  RpcClientError.RpcClientError
>

export interface UiConnection {
  readonly endpoint: string
  readonly rpc: UiClient
}

export interface BackendConnection {
  readonly endpoint: string
  readonly rpc: BackendClient
  readonly requests: Stream.Stream<
    BackendProtocol.OpenedExchange,
    Schema.SchemaError
  >
  readonly closed: Effect.Effect<void>
  readonly attach: () => Effect.Effect<
    { readonly attached: true },
    | SimulationConnectionError
    | RpcClientError.RpcClientError
    | SimulationRequestError
  >
}

export const ui = Effect.fn("SimulationConnector.ui")(function* (
  endpoint: string,
  options?: Options,
) {
  const protocol = yield* OpenCodeRpcProtocol.make(endpoint, {
    connectTimeout: options?.connectTimeout,
  })
  const rpc = yield* RpcClient.make(UiRpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  )
  return { endpoint, rpc } satisfies UiConnection
})

export const backend = Effect.fn("SimulationConnector.backend")(function* (
  endpoint: string,
  options?: Options,
) {
  const requests = yield* Queue.unbounded<
    BackendProtocol.OpenedExchange,
    Schema.SchemaError
  >()
  const closed = yield* Deferred.make<void>()
  const close = Effect.all([
    Deferred.succeed(closed, undefined),
    Queue.shutdown(requests),
  ], { discard: true })
  yield* Effect.addFinalizer(() => close)
  const protocol = yield* OpenCodeRpcProtocol.make(endpoint, {
    connectTimeout: options?.connectTimeout,
    onClose: () => close,
    onNotification: ({ method, params }) => {
      if (method !== "llm.request") return Effect.void
      return Effect.matchEffect(
        Schema.decodeUnknownEffect(BackendProtocol.OpenedExchange)(params),
        {
          onFailure: (error) => Queue.fail(requests, error).pipe(Effect.asVoid),
          onSuccess: (request) =>
            Queue.offer(requests, request).pipe(Effect.asVoid),
        },
      )
    },
  })
  const rpc = yield* RpcClient.make(BackendRpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  )
  const attach = Effect.fn("SimulationConnector.attach")(() =>
    rpc["llm.attach"]().pipe(
      Effect.timeoutOrElse({
        duration: options?.requestTimeout ?? 30_000,
        orElse: () =>
          Effect.fail(
            new SimulationConnectionError({
              endpoint,
              operation: "llm.attach",
              message: `llm.attach timed out after ${options?.requestTimeout ?? 30_000}ms`,
            }),
          ),
      }),
    ),
  )
  if (options?.attach !== false) yield* attach()
  return {
    endpoint,
    rpc,
    requests: Stream.fromQueue(requests),
    closed: Deferred.await(closed),
    attach,
  } satisfies BackendConnection
})

export interface Interface {
  readonly ui: typeof ui
  readonly backend: typeof backend
}

export class Service extends Context.Service<Service, Interface>()(
  "opencode-drive/SimulationConnector",
) {}

export const layer = Layer.succeed(Service, Service.of({ ui, backend }))

export * as SimulationConnector from "./connector.js"
