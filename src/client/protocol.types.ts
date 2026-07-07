// CLI command contract for `opencode-drive send`.

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json }

export type KeyModifiers = {
  ctrl?: boolean
  shift?: boolean
  meta?: boolean
  super?: boolean
  hyper?: boolean
}

export type Element = {
  id: string
  num: number
  x: number
  y: number
  width: number
  height: number
  focusable: boolean
  focused: boolean
  clickable: boolean
  editor: boolean
}

export type State = {
  focused: {
    renderable?: number
    editor: boolean
  }
  elements: Element[]
}

export type Command =
  | { name: "ui.type"; params: { text: string }; result: State }
  | {
      name: "ui.press"
      params: { key: string; modifiers?: KeyModifiers }
      result: State
    }
  | { name: "ui.enter"; result: State }
  | {
      name: "ui.arrow"
      params: { direction: "up" | "down" | "left" | "right" }
      result: State
    }
  | { name: "ui.focus"; params: { target: number }; result: State }
  | {
      name: "ui.click"
      params: { target: number; x: number; y: number }
      result: State
    }
  | { name: "ui.screenshot"; result: string }
  | { name: "ui.state"; result: State }
  | { name: "ui.start-record"; result: { recording: true } }
  | { name: "ui.end-record"; result: string }

// Commands with `params` take one JSON argument:
//   --command.ui.type '{"text":"hello"}'
// Commands without `params` are flags:
//   --command.ui.enter
