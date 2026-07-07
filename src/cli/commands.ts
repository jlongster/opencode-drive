import { Backend, connectBackendSimulation, connectSimulation, Frontend } from "../client/index.js"
import type { DriveCommand, InstanceManifest } from "./types.js"

export const commandInfo = {
  "ui.type": { value: true, description: "Type text using JSON params" },
  "ui.press": { value: true, description: "Press a key using JSON params" },
  "ui.enter": { value: false, description: "Press Enter" },
  "ui.arrow": { value: true, description: "Press an arrow key using JSON params" },
  "ui.focus": { value: true, description: "Focus an element using JSON params" },
  "ui.click": { value: true, description: "Click using JSON params" },
  "ui.screenshot": { value: false, description: "Take a screenshot and return its path" },
  "ui.state": { value: false, description: "Return focus, elements, and available UI actions" },
  "ui.start-record": { value: false, description: "Start recording the UI" },
  "ui.end-record": { value: false, description: "Stop recording and return the recording path" },
  "llm.pending": { value: false, description: "List pending simulated LLM exchanges" },
  "llm.chunk": { value: true, description: "Send response items to a simulated LLM exchange" },
  "llm.finish": { value: true, description: "Finish a simulated LLM exchange" },
  "llm.disconnect": { value: true, description: "Disconnect a simulated LLM exchange" },
} as const

export function commandAcceptsValue(operation: string) {
  if (operation in commandInfo) return commandInfo[operation as keyof typeof commandInfo].value
  throw new Error(`unknown drive command "${operation}"`)
}

export function commandNames() {
  return Object.keys(commandInfo).sort()
}

export async function executeCommands(manifest: InstanceManifest, commands: ReadonlyArray<DriveCommand>) {
  const clients: {
    ui?: Awaited<ReturnType<typeof connectSimulation>>
    backend?: Awaited<ReturnType<typeof connectBackendSimulation>>
  } = {}
  const ui = async () => (clients.ui ??= await connectSimulation({ url: manifest.endpoints.ui }))
  const backend = async () => (clients.backend ??= await connectBackendSimulation({ url: manifest.endpoints.backend }))
  const results: Array<{ readonly command: string; readonly result: unknown }> = []
  try {
    for (const command of commands) {
      results.push({ command: command.operation, result: await execute(command, ui, backend) })
    }
    return { name: manifest.name, results }
  } catch (error) {
    throw new CommandBatchError(manifest.name, results, error)
  } finally {
    clients.ui?.close()
    clients.backend?.close()
  }
}

export class CommandBatchError extends Error {
  constructor(
    readonly instance: string,
    readonly results: ReadonlyArray<{ readonly command: string; readonly result: unknown }>,
    readonly reason: unknown,
  ) {
    super(reason instanceof Error ? reason.message : String(reason))
    this.name = "CommandBatchError"
  }
}

async function execute(
  command: DriveCommand,
  ui: () => Promise<Awaited<ReturnType<typeof connectSimulation>>>,
  backend: () => Promise<Awaited<ReturnType<typeof connectBackendSimulation>>>,
) {
  switch (command.operation) {
    case "ui.type": {
      const request = Frontend.decodeRequest({ jsonrpc: "2.0", method: "ui.type", params: json(required(command)) })
      if (request.method !== "ui.type") throw new Error("invalid ui.type params")
      return (await ui()).typeText(request.params.text)
    }
    case "ui.press": {
      const request = Frontend.decodeRequest({ jsonrpc: "2.0", method: "ui.press", params: json(required(command)) })
      if (request.method !== "ui.press") throw new Error("invalid ui.press params")
      return (await ui()).pressKey(request.params.key, request.params.modifiers)
    }
    case "ui.enter": return (await ui()).pressEnter()
    case "ui.arrow": {
      const request = Frontend.decodeRequest({ jsonrpc: "2.0", method: "ui.arrow", params: json(required(command)) })
      if (request.method !== "ui.arrow") throw new Error("invalid ui.arrow params")
      return (await ui()).pressArrow(request.params.direction)
    }
    case "ui.focus": {
      const request = Frontend.decodeRequest({ jsonrpc: "2.0", method: "ui.focus", params: json(required(command)) })
      if (request.method !== "ui.focus") throw new Error("invalid ui.focus params")
      return (await ui()).focus(request.params.target)
    }
    case "ui.click": {
      const request = Frontend.decodeRequest({ jsonrpc: "2.0", method: "ui.click", params: json(required(command)) })
      if (request.method !== "ui.click") throw new Error("invalid ui.click params")
      return (await ui()).click(request.params.target, request.params.x, request.params.y)
    }
    case "ui.screenshot": return (await ui()).screenshot()
    case "ui.state": return (await ui()).state()
    case "ui.start-record": return (await ui()).startRecord()
    case "ui.end-record": return (await ui()).endRecord()
    case "llm.pending": return (await backend()).pendingExchanges()
    case "llm.chunk": {
      const request = Backend.decodeRequest({ jsonrpc: "2.0", method: "llm.chunk", params: json(required(command)) })
      if (request.method !== "llm.chunk") throw new Error("invalid llm.chunk params")
      return (await backend()).chunk(request.params.id, request.params.items)
    }
    case "llm.finish": {
      const request = Backend.decodeRequest({ jsonrpc: "2.0", method: "llm.finish", params: json(required(command)) })
      if (request.method !== "llm.finish") throw new Error("invalid llm.finish params")
      return (await backend()).finish(request.params.id, request.params.reason)
    }
    case "llm.disconnect": {
      const request = Backend.decodeRequest({ jsonrpc: "2.0", method: "llm.disconnect", params: json(required(command)) })
      if (request.method !== "llm.disconnect") throw new Error("invalid llm.disconnect params")
      return (await backend()).disconnect(request.params.id)
    }
  }
  throw new Error(`unknown drive command "${command.operation}"`)
}

function required(command: DriveCommand) {
  if (command.value === undefined) throw new Error(`${command.operation} requires a value`)
  return command.value
}

function json(value: string): unknown {
  return JSON.parse(value)
}
