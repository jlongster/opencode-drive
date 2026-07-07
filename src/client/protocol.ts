export type Json = null | boolean | number | string | ReadonlyArray<Json> | { readonly [key: string]: Json }

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id?: string | number | null
  readonly method: string
  readonly params?: Json
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly result?: Json
  readonly error?: { readonly code: number; readonly message: string; readonly data?: Json }
}

export interface KeyModifiers {
  readonly ctrl?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
  readonly super?: boolean
  readonly hyper?: boolean
}

export type UiAction =
  | { readonly type: "typeText"; readonly text: string }
  | { readonly type: "pressKey"; readonly key: string; readonly modifiers?: KeyModifiers }
  | { readonly type: "pressEnter" }
  | { readonly type: "pressArrow"; readonly direction: "up" | "down" | "left" | "right" }
  | { readonly type: "focus"; readonly target: number }
  | { readonly type: "click"; readonly target: number; readonly x: number; readonly y: number }

export interface UiElement {
  readonly id: string
  readonly num: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly focusable: boolean
  readonly focused: boolean
  readonly clickable: boolean
  readonly editor: boolean
}

export interface UiState {
  readonly screen: string
  readonly focused: { readonly renderable?: number; readonly editor: boolean }
  readonly elements: ReadonlyArray<UiElement>
  readonly actions: ReadonlyArray<UiAction>
}

export interface TraceRecord {
  readonly id: number
  readonly time: string
  readonly type: string
  readonly data?: Json
}

export interface TraceList {
  readonly records: ReadonlyArray<TraceRecord>
}

export type BackendItem =
  | { readonly type: "textDelta"; readonly text: string }
  | { readonly type: "reasoningDelta"; readonly text: string }
  | { readonly type: "toolCall"; readonly id: string; readonly name: string; readonly input: Json }
  | { readonly type: "raw"; readonly chunk: Json }

export type BackendFinishReason = "stop" | "tool-calls" | "length" | "content-filter"

export interface OpenedExchange {
  readonly id: string
  readonly url: string
  readonly body: Json
}

export interface NetworkLogEntry {
  readonly time: number
  readonly method: string
  readonly url: string
  readonly matched: boolean
}

export interface TraceCleared {
  readonly cleared: true
}

export interface Methods {
  readonly "ui.state": { readonly params: undefined; readonly result: UiState }
  readonly "ui.action": { readonly params: { readonly action: UiAction }; readonly result: UiState }
  readonly "ui.render": { readonly params: undefined; readonly result: UiState }
  readonly "event.pause": { readonly params: undefined; readonly result: { readonly state: "paused" } }
  readonly "event.resume": {
    readonly params: undefined
    readonly result: { readonly state: "connected" | "reconnecting" }
  }
  readonly "event.state": {
    readonly params: undefined
    readonly result: { readonly state: "connected" | "paused" | "reconnecting" }
  }
  readonly "trace.list": { readonly params: undefined; readonly result: TraceList }
  readonly "trace.clear": { readonly params: undefined; readonly result: TraceCleared }
  readonly "trace.export": { readonly params: undefined; readonly result: TraceList }
}

export interface BackendMethods {
  readonly "llm.attach": { readonly params: undefined; readonly result: { readonly attached: true } }
  readonly "llm.chunk": {
    readonly params: { readonly id: string; readonly items: ReadonlyArray<BackendItem> }
    readonly result: { readonly ok: true }
  }
  readonly "llm.finish": {
    readonly params: { readonly id: string; readonly reason?: BackendFinishReason }
    readonly result: { readonly ok: true }
  }
  readonly "llm.disconnect": {
    readonly params: { readonly id: string }
    readonly result: { readonly ok: true }
  }
  readonly "llm.pending": { readonly params: undefined; readonly result: { readonly exchanges: ReadonlyArray<OpenedExchange> } }
  readonly "network.log": { readonly params: undefined; readonly result: { readonly entries: ReadonlyArray<NetworkLogEntry> } }
}

export type MethodName = keyof Methods
export type BackendMethodName = keyof BackendMethods

export const defaultPort = 40900
export const defaultBackendPort = 40950
