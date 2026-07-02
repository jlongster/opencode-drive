/**
 * Wire types for the OpenCode simulation control protocol.
 *
 * Mirrors `packages/tui/src/simulation/{server,actions,trace}.ts` in the
 * OpenCode checkout: JSON-RPC 2.0 over a loopback WebSocket, served by the
 * TUI when it runs with `OPENCODE_SIMULATION=1`.
 */

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
  readonly focused: {
    readonly renderable?: number
    readonly editor: boolean
  }
  readonly elements: ReadonlyArray<UiElement>
  readonly actions: ReadonlyArray<UiAction>
}

export interface TraceRecord {
  readonly id: number
  readonly time: string
  readonly type: string
  readonly data?: unknown
}

export interface TraceList {
  readonly records: ReadonlyArray<TraceRecord>
}

export interface TraceCleared {
  readonly cleared: true
}

/** Method name -> { params, result } for every server-exposed method. */
export interface Methods {
  readonly "ui.state": { readonly params: undefined; readonly result: UiState }
  readonly "ui.action": { readonly params: { readonly action: UiAction }; readonly result: UiState }
  readonly "ui.render": { readonly params: undefined; readonly result: UiState }
  readonly "trace.list": { readonly params: undefined; readonly result: TraceList }
  readonly "trace.clear": { readonly params: undefined; readonly result: TraceCleared }
  readonly "trace.export": { readonly params: undefined; readonly result: TraceList }
}

export type MethodName = keyof Methods

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0"
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly result?: unknown
  readonly error?: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

/** Default server port; the server scans upward from here when occupied. */
export const defaultPort = 40900
