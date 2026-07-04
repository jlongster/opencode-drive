import { connectBackendSimulation, connectSimulation, type OpenedExchange } from "./client/index.js"
import { flowProperties, type FlowPropertyContext, type FlowResult, type FlowScenario, type TurnOutcome } from "./flows/index.js"

const scenarioPath = process.argv[2]
const resultPath = process.argv[3]
if (scenarioPath === undefined) throw new Error("usage: flow-driver SCENARIO [RESULT]")

const scenario: FlowScenario = await Bun.file(scenarioPath).json()
const stepDelay = Number(process.env.OPENCODE_PROBE_STEP_DELAY ?? "0")
const chunkDelay = Number(process.env.OPENCODE_PROBE_CHUNK_DELAY ?? "30")
const started = Date.now()
const ui = await connectSimulation({ url: requiredEnv("OPENCODE_SIMULATION_UI_WS") })
const backend = await connectBackendSimulation({ url: requiredEnv("OPENCODE_SIMULATION_BACKEND_WS") })
const responses = scenario.turns.flatMap((turn) => turn.responses)
let assistantExchanges = 0
let responseCursor = 0
let titleExchanges = 0
let failure: Error | undefined
const active = new Set<string>()
const interrupted = new Set<string>()
let chunksSent = 0

await backend.attach(async (request: OpenedExchange) => {
  try {
    if (isTitleRequest(request)) {
      titleExchanges++
      await backend.chunk(request.id, [{ type: "textDelta", text: scenario.name }])
      await backend.finish(request.id, "stop")
      return
    }
    const response = responses[responseCursor++]
    assistantExchanges++
    if (response === undefined) throw new Error(`unexpected assistant exchange ${assistantExchanges}`)
    active.add(request.id)
    for (const chunk of response.chunks) {
      await backend.chunk(request.id, chunk)
      chunksSent++
      if (chunkDelay > 0) await Bun.sleep(chunkDelay)
    }
    if (chunkDelay > 0) await Bun.sleep(chunkDelay * 3)
    if (response.terminal !== "invalid-provider-event") await backend.finish(request.id, response.finish)
  } catch (error) {
    if (!interrupted.has(request.id)) failure = error instanceof Error ? error : new Error(String(error))
  } finally {
    active.delete(request.id)
  }
})

try {
  await waitFor("prompt editor", async () => (await ui.render()).focused.editor)
  let expectedExchanges = 0
  for (const turn of scenario.turns) {
    if (failure !== undefined) throw failure
    expectedExchanges += turn.responses.length
    const beforeChunks = chunksSent
    await ui.typeText(turn.prompt)
    await ui.pressEnter()
    await runProperties("afterSubmit", { turn, ui, backend, waitFor })
    if (turn.interaction === "double-submit") await ui.pressEnter()
    let outcome: TurnOutcome = "completed"
    if (turn.interaction === "steer") {
      await waitFor("active stream", async () => active.size > 0 && chunksSent > beforeChunks)
      await ui.typeText(turn.steerPrompt ?? "Also inspect the active boundary.")
      await ui.pressEnter()
    }
    if (turn.interaction === "interrupt") {
      await waitFor("interruptible stream", async () => active.size > 0 && chunksSent > beforeChunks)
      for (const id of active) interrupted.add(id)
      await ui.pressKey("escape")
      await ui.pressKey("escape")
      await waitFor("interrupted provider drain", async () => active.size === 0 && (await backend.pendingExchanges()).exchanges.length === 0)
      responseCursor = expectedExchanges
      outcome = "interrupted"
    } else if (turn.interaction === "provider-drop") {
      await waitFor("dropped provider drain", async () => active.size === 0 && (await backend.pendingExchanges()).exchanges.length === 0)
      await ui.pressKey("escape")
      await ui.pressKey("escape")
      outcome = "provider-error"
    } else {
      await waitFor(turn.marker, async () => {
        if (failure !== undefined) throw failure
        await ui.render()
        return responseCursor >= expectedExchanges
      })
    }
    await runProperties("afterTerminal", { turn, ui, backend, outcome, waitFor })
    if (stepDelay > 0) await Bun.sleep(stepDelay)
  }
  await waitFor("provider idle", async () => (await backend.pendingExchanges()).exchanges.length === 0)
  if (assistantExchanges > scenario.coverage.providerExchanges) {
    throw new Error(`expected at most ${scenario.coverage.providerExchanges} assistant exchanges, received ${assistantExchanges}`)
  }
  const trace = await ui.traceExport()
  const result: FlowResult = {
    seed: scenario.seed,
    name: scenario.name,
    turns: scenario.turns.length,
    assistantExchanges,
    titleExchanges,
    traceRecords: trace.records.length,
    durationMs: Date.now() - started,
    finalScreen: (await ui.state()).screen,
  }
  if (resultPath !== undefined) await Bun.write(resultPath, `${JSON.stringify(result, undefined, 2)}\n`)
  console.log(JSON.stringify({ ...result, finalScreen: undefined }))
} finally {
  ui.close()
  backend.close()
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (value === undefined) throw new Error(`${name} is required`)
  return value
}

function isTitleRequest(request: OpenedExchange) {
  if (typeof request.body !== "object" || request.body === null || !("messages" in request.body)) return false
  const messages = request.body.messages
  if (!Array.isArray(messages)) return false
  const first = messages[0]
  if (typeof first !== "object" || first === null || !("content" in first)) return false
  return typeof first.content === "string" && first.content.includes("You are a title generator")
}

async function waitFor(label: string, check: () => Promise<boolean>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await Bun.sleep(50)
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function runProperties(stage: "afterSubmit" | "afterTerminal", context: FlowPropertyContext) {
  for (const property of flowProperties) {
    const check = property[stage]
    if (check === undefined) continue
    try {
      await check(context)
    } catch (error) {
      throw new Error(`property ${property.name} failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      })
    }
  }
}
