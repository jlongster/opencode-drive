import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"
import { connectBackendSimulation, connectSimulation } from "../client/index.js"
import type {
  BackendSimulationClient,
  SimulationClient,
} from "../client/index.js"
import { createScriptFileSystem } from "../script/filesystem.js"
import type {
  LlmOutput,
  LlmRequest,
  LlmResponse,
  LlmServeHandler,
  ScriptDefinition,
  ScriptLlm,
  ScriptUi,
  UiElement,
  UiElementQuery,
  UiKeyModifiers,
  UiMatcher,
  UiPosition,
  UiPredicate,
  UiState,
  UiWaitOptions,
} from "../script/types.js"

export async function loadScript(file: string): Promise<ScriptDefinition> {
  const module: { readonly default?: unknown } = await import(
    pathToFileURL(resolve(file)).href
  )
  if (!isScriptDefinition(module.default))
    throw new Error("script must default-export defineScript({ setup?, run })")
  return module.default
}

export async function runScript(
  script: ScriptDefinition,
  artifacts: string,
  endpoints: { readonly ui: string; readonly backend: string },
  signal: AbortSignal,
  onScreenshot?: (path: string) => void,
) {
  const client = await connectSimulation({ url: endpoints.ui, onScreenshot })
  const backend = await connectBackendSimulation({
    url: endpoints.backend,
  }).catch((error) => {
    client.close()
    throw error
  })
  const ui = new ScriptUiClient(client, signal)
  const llm = new ScriptLlmClient(backend)
  const abort = () => {
    client.close()
    backend.close()
  }
  signal.addEventListener("abort", abort, { once: true })
  try {
    await llm.attach()
    await waitForEditor(client, signal)
    const execution = Promise.resolve(
      script.run({
        fs: createScriptFileSystem(join(artifacts, "files")),
        ui,
        llm,
        artifacts,
        signal,
      }),
    )
    await Promise.race([execution, llm.failure, aborted(signal)])
    await llm.settle()
  } finally {
    signal.removeEventListener("abort", abort)
    client.close()
    backend.close()
  }
}

class ScriptUiClient implements ScriptUi {
  constructor(
    private readonly client: SimulationClient,
    private readonly signal: AbortSignal,
  ) {}

  state(): Promise<UiState> {
    return this.client.state()
  }

  matches(matcher: UiMatcher): Promise<boolean> {
    return this.client.matches(matcher)
  }

  screenshot(name?: string): Promise<string> {
    return this.client.screenshot(name)
  }

  type(text: string): Promise<UiState> {
    return this.client.typeText(text)
  }

  press(key: string, modifiers?: UiKeyModifiers): Promise<UiState> {
    return this.client.pressKey(key, modifiers)
  }

  enter(): Promise<UiState> {
    return this.client.pressEnter()
  }

  arrow(direction: "up" | "down" | "left" | "right"): Promise<UiState> {
    return this.client.pressArrow(direction)
  }

  focus(target: number | UiElement): Promise<UiState> {
    return this.client.focus(typeof target === "number" ? target : target.num)
  }

  async click(
    target: number | UiElement,
    position?: UiPosition,
  ): Promise<UiState> {
    const element =
      typeof target === "number" ? await this.getElement(target) : target
    return this.client.click(
      element.num,
      position?.x ?? Math.floor(element.width / 2),
      position?.y ?? Math.floor(element.height / 2),
    )
  }

  async submit(text: string): Promise<UiState> {
    await this.type(text)
    return this.enter()
  }

  waitFor(
    target: UiMatcher | UiPredicate,
    options?: UiWaitOptions,
  ): Promise<UiState> {
    return this.poll(async () => {
      if (typeof target === "string")
        return (await this.matches(target)) ? await this.state() : undefined
      const state = await this.state()
      return (await target(state)) ? state : undefined
    }, options, "timed out waiting for the UI to match")
  }

  getElement(
    target: number | string | UiElementQuery,
    options?: UiWaitOptions,
  ): Promise<UiElement> {
    return this.poll(async () => {
      const state = await this.state()
      const elements = state.elements.filter((element) =>
        typeof target === "number"
          ? element.num === target
          : typeof target === "string"
            ? element.id === target
            : matchesElement(element, target),
      )
      if (elements.length > 1)
        throw new Error(`ui.getElement matched ${elements.length} elements`)
      return elements[0]
    }, options, "timed out waiting for the UI element")
  }

  private async poll<T>(
    read: () => Promise<T | undefined>,
    options: UiWaitOptions | undefined,
    message: string,
  ): Promise<T> {
    const deadline = Date.now() + (options?.timeout ?? 5_000)
    do {
      this.signal.throwIfAborted()
      const result = await read()
      if (result !== undefined) return result
      await Bun.sleep(options?.interval ?? 50)
    } while (Date.now() <= deadline)
    throw new Error(message)
  }
}

class ScriptLlmClient implements ScriptLlm {
  private readonly pending: LlmRequest[] = []
  private readonly queued: QueuedLlmResponse[] = []
  private readonly tasks = new Set<Promise<void>>()
  private handler: LlmServeHandler | undefined
  private mode: "queue" | "serve" | undefined
  private requestIndex = 0
  private failed = false
  private readonly changes = new Set<() => void>()
  private rejectFailure!: (error: unknown) => void
  readonly failure = new Promise<never>((_resolve, reject) => {
    this.rejectFailure = reject
  })

  constructor(private readonly backend: BackendSimulationClient) {}

  async attach() {
    await this.backend.attach((request) => {
      this.pending.push(request)
      this.drain()
      this.notify()
    })
  }

  queue(...output: ReadonlyArray<LlmOutput>): void {
    if (this.mode === "serve")
      throw new Error("llm.queue cannot be used after llm.serve")
    this.mode = "queue"
    this.queued.push({ output })
    this.drain()
  }

  send(...output: ReadonlyArray<LlmOutput>): Promise<void> {
    if (this.mode === "serve")
      throw new Error("llm.send cannot be used after llm.serve")
    this.mode = "queue"
    const completed = Promise.withResolvers<void>()
    this.queued.push({ output, completed })
    this.drain()
    return completed.promise
  }

  serve(handler: LlmServeHandler): void {
    if (this.mode !== undefined)
      throw new Error("llm.serve must be the only LLM response mode")
    this.mode = "serve"
    this.handler = handler
    this.drain()
  }

  text(text: string, options?: Parameters<ScriptLlm["text"]>[1]) {
    return {
      type: "text" as const,
      text,
      ...(options === undefined ? {} : { options }),
    }
  }

  reasoning(text: string, options?: Parameters<ScriptLlm["reasoning"]>[1]) {
    return {
      type: "reasoning" as const,
      text,
      ...(options === undefined ? {} : { options }),
    }
  }

  pause(milliseconds: number) {
    return { type: "pause" as const, milliseconds }
  }

  toolCall(call: Parameters<ScriptLlm["toolCall"]>[0]) {
    return { type: "toolCall" as const, ...call }
  }

  raw(chunk: Parameters<ScriptLlm["raw"]>[0]) {
    return { type: "raw" as const, chunk }
  }

  finish(reason?: Parameters<ScriptLlm["finish"]>[0]) {
    return { type: "finish" as const, ...(reason === undefined ? {} : { reason }) }
  }

  disconnect() {
    return { type: "disconnect" as const }
  }

  async settle() {
    const deadline = Date.now() + 30_000
    while (this.mode === "queue" && this.queued.length > 0) {
      const remaining = deadline - Date.now()
      if (remaining <= 0)
        throw new Error(
          `timed out with ${this.queued.length} unused LLM response(s)`,
        )
      await this.waitForChange(remaining)
    }
    while (this.tasks.size > 0) await Promise.all(this.tasks)
    if (this.mode === "queue" && this.pending.length > 0)
      throw new Error(`received ${this.pending.length} unexpected LLM request(s)`)
  }

  private drain() {
    while (this.pending.length > 0) {
      const request = this.pending[0]!
      if (this.handler !== undefined) {
        this.pending.shift()
        const index = this.requestIndex++
        this.start(request, () => this.handler!(request, index))
        continue
      }
      const queued = this.queued.shift()
      if (queued === undefined) return
      this.pending.shift()
      this.requestIndex++
      this.start(request, () => queued.output, queued.completed)
    }
  }

  private start(
    request: LlmRequest,
    output: () => LlmResponse,
    completed?: PromiseWithResolvers<void>,
  ) {
    const task = this.respond(request, output)
      .then(() => completed?.resolve())
      .catch((error) => {
        completed?.reject(error)
        if (!this.failed) {
          this.failed = true
          this.rejectFailure(error)
        }
        throw error
      })
      .finally(() => this.tasks.delete(task))
    this.tasks.add(task)
    void task.catch(() => undefined)
  }

  private waitForChange(timeout: number) {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (result: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.changes.delete(changed)
        result()
      }
      const changed = () => {
        finish(resolve)
      }
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(
              new Error(
                `timed out with ${this.queued.length} unused LLM response(s)`,
              ),
            ),
          ),
        timeout,
      )
      this.changes.add(changed)
      void this.failure.catch((error) => finish(() => reject(error)))
    })
  }

  private notify() {
    for (const changed of this.changes) changed()
  }

  private async respond(request: LlmRequest, output: () => LlmResponse) {
    let terminal = false
    for await (const item of output()) {
      if (terminal)
        throw new Error(`LLM response ${request.id} emitted output after its terminal event`)
      if (item.type === "finish") {
        terminal = true
        await this.backend.finish(request.id, item.reason)
      } else if (item.type === "disconnect") {
        terminal = true
        await this.backend.disconnect(request.id)
      } else if (item.type === "text") {
        await this.streamDelta(
          request.id,
          "textDelta",
          "text",
          item.text,
          item.options,
        )
      } else if (item.type === "reasoning") {
        await this.streamDelta(
          request.id,
          "reasoningDelta",
          "reasoning",
          item.text,
          item.options,
        )
      } else if (item.type === "pause") {
        if (!Number.isFinite(item.milliseconds) || item.milliseconds < 0)
          throw new Error("llm.pause milliseconds must be a non-negative number")
        if (item.milliseconds > 0) await Bun.sleep(item.milliseconds)
      } else {
        await this.backend.chunk(request.id, [item])
      }
    }
    if (!terminal) await this.backend.finish(request.id, "stop")
  }

  private async streamDelta(
    id: string,
    type: "textDelta" | "reasoningDelta",
    helper: "text" | "reasoning",
    text: string,
    options: Parameters<ScriptLlm["text"]>[1],
  ) {
    const delay = options?.delay ?? 2
    const chunkSize = options?.chunkSize ?? 15
    if (!Number.isFinite(delay) || delay < 0)
      throw new Error(`llm.${helper} delay must be a non-negative number`)
    if (!Number.isInteger(chunkSize) || chunkSize < 1)
      throw new Error(`llm.${helper} chunkSize must be a positive integer`)

    const characters = Array.from(text)
    for (let index = 0; index < characters.length; ) {
      const size = Math.max(1, chunkSize + Math.floor(Math.random() * 11) - 5)
      const end = Math.min(characters.length, index + size)
      const chunk = characters.slice(index, end).join("")
      index = end
      await this.backend.chunk(id, [{ type, text: chunk }])
      if (index < characters.length && delay > 0) await Bun.sleep(delay)
    }
  }
}

interface QueuedLlmResponse {
  readonly output: ReadonlyArray<LlmOutput>
  readonly completed?: PromiseWithResolvers<void>
}

async function waitForEditor(ui: SimulationClient, signal: AbortSignal) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    if ((await ui.state()).focused.editor) return
    await Bun.sleep(50)
  }
  throw new Error("timed out waiting for the prompt editor")
}

function matchesElement(element: UiElement, query: UiElementQuery) {
  return (
    (query.id === undefined || element.id === query.id) &&
    (query.num === undefined || element.num === query.num) &&
    (query.focusable === undefined || element.focusable === query.focusable) &&
    (query.focused === undefined || element.focused === query.focused) &&
    (query.clickable === undefined || element.clickable === query.clickable) &&
    (query.editor === undefined || element.editor === query.editor)
  )
}

function aborted(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("script aborted"))
      return
    }
    signal.addEventListener(
      "abort",
      () => reject(signal.reason ?? new Error("script aborted")),
      { once: true },
    )
  })
}

function isScriptDefinition(value: unknown): value is ScriptDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const script = value as { readonly run?: unknown; readonly setup?: unknown }
  return (
    typeof script.run === "function" &&
    (script.setup === undefined || typeof script.setup === "function")
  )
}
