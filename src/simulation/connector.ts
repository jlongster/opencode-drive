import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import * as OpenCodeRpcProtocol from "./opencode-protocol.js"
import { Backend as BackendProtocol } from "./protocol.js"
import { BackendRpcs, UiRpcs } from "./rpc.js"

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
}

export const ui = Effect.fn("SimulationConnector.ui")(function* (
  endpoint: string,
) {
  const protocol = yield* OpenCodeRpcProtocol.make(endpoint)
  const rpc = yield* RpcClient.make(UiRpcs).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  )
  return { endpoint, rpc } satisfies UiConnection
})

export const backend = Effect.fn("SimulationConnector.backend")(function* (
  endpoint: string,
) {
  const requests = yield* Queue.unbounded<
    BackendProtocol.OpenedExchange,
    Schema.SchemaError
  >()
  yield* Effect.addFinalizer(() => Queue.shutdown(requests))
  const protocol = yield* OpenCodeRpcProtocol.make(endpoint, {
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
  yield* rpc["llm.attach"]()
  return {
    endpoint,
    rpc,
    requests: Stream.fromQueue(requests),
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
