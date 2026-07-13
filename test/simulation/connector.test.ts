import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema, Stream } from "effect"
import { SimulationConnector } from "../../src/simulation/connector.js"
import {
  sendResult,
  startTransportPeer,
} from "./transport-peer.js"

const state = {
  focused: { renderable: 1, editor: true },
  elements: [],
}

describe("SimulationConnector", () => {
  test("acquires a generated UI client through the service seam", async () => {
    const peer = startTransportPeer(({ request, socket }) =>
      sendResult(socket, request, state),
    )

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const connector = yield* SimulationConnector.Service
            const connection = yield* connector.ui(peer.url)

            expect(connection.endpoint).toBe(peer.url)
            expect(yield* connection.rpc["ui.state"]()).toEqual(state)
          }).pipe(Effect.provide(SimulationConnector.layer)),
        ),
      )
      expect(peer.received.map(({ request }) => request)).toEqual([
        { jsonrpc: "2.0", id: 1, method: "ui.state" },
      ])
    } finally {
      await peer.stop()
    }
  })

  test("attaches after installing a validated backend request stream", async () => {
    const exchange = {
      id: "exchange-1",
      url: "https://api.openai.com/v1/responses",
      body: { model: "test-model" },
    }
    const peer = startTransportPeer(({ request, socket }) => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "llm.request",
          params: exchange,
        }),
      )
      sendResult(socket, request, { attached: true })
    })

    try {
      const output = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const connector = yield* SimulationConnector.Service
            const connection = yield* connector.backend(peer.url)
            const request = yield* Stream.runHead(connection.requests)
            return { endpoint: connection.endpoint, request }
          }).pipe(Effect.provide(SimulationConnector.layer)),
        ),
      )

      expect(output.endpoint).toBe(peer.url)
      expect(output.request).toEqual(Option.some(exchange))
      expect(peer.received.map(({ request }) => request)).toEqual([
        { jsonrpc: "2.0", id: 1, method: "llm.attach" },
      ])
    } finally {
      await peer.stop()
    }
  })

  test("fails the backend request stream for invalid llm.request payloads", async () => {
    const peer = startTransportPeer(({ request, socket }) => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "llm.request",
          params: { id: 1 },
        }),
      )
      sendResult(socket, request, { attached: true })
    })

    try {
      const error = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const connector = yield* SimulationConnector.Service
            const connection = yield* connector.backend(peer.url)
            return yield* Stream.runHead(connection.requests).pipe(Effect.flip)
          }).pipe(Effect.provide(SimulationConnector.layer)),
        ),
      )
      expect(Schema.isSchemaError(error)).toBe(true)
    } finally {
      await peer.stop()
    }
  })
})
