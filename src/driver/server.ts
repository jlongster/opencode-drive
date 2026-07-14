import * as Effect from "effect/Effect"
import * as SimulationConnector from "../simulation/connector.js"
import * as OpenCodeClients from "./client.js"
import * as LlmController from "./llm-controller.js"
import * as ProcessSpawner from "./process-spawner.js"
import type { Project } from "./project.js"

export interface Options {
  readonly project: Project
  readonly target?: ProcessSpawner.Target
}

export interface Server {
  readonly llm: LlmController.Controller
  readonly clients: OpenCodeClients.Control
}

export const make = Effect.fn("OpenCodeServer.make")(function* (
  options: Options,
) {
  const spawner = yield* ProcessSpawner.Service
  const connector = yield* SimulationConnector.Service
  const process = yield* spawner.server(options.project, options.target)
  const backend = yield* connector.backend(process.endpoint)
  const llm = yield* LlmController.make(backend)
  const clients = yield* OpenCodeClients.makeClients(
    process,
    spawner,
    connector,
  )
  return { llm, clients } satisfies Server
})

export * as OpenCodeServer from "./server.js"
