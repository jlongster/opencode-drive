export { SimulationClient, SimulationError, connectSimulation } from "./client.js"
export { BackendSimulationClient, BackendSimulationError, connectBackendSimulation } from "./backend.js"
export type { BackendSimulationClientOptions } from "./backend.js"
export type { SimulationClientOptions } from "./client.js"
export const defaultPort = 40900
export const defaultBackendPort = 40950
export { Backend, Frontend, JsonRpc, SimulationProtocol } from "./protocol.js"
export type {
  LlmFinishReason as BackendFinishReason,
  LlmItem as BackendItem,
  LlmRequest as OpenedExchange,
  UiAction,
  UiElement,
  UiKeyModifiers as KeyModifiers,
  UiState,
} from "../script/types.js"
