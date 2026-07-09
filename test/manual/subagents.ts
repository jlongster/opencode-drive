import { defineScript, type JsonValue, type ScriptUi } from "../../src/index.js"

export default defineScript({
  async setup({ fs }) {
    await fs.writeFile(
      "src/ledger.ts",
      [
        "export const credits = [8, 13, 21]",
        "export const total = credits.reduce((sum, value) => sum + value, 0)",
        "",
      ].join("\n"),
    )
  },

  async run({ llm, ui }) {
    let phase = 0

    llm.serve(async function* (request) {
      if (isTitleRequest(request.body)) {
        yield llm.text("Delegating ledger checks")
        return
      }

      if (phase === 0 || phase === 3) {
        const tool = subagentTool(request.body)
        const first = phase === 0
        phase++
        yield llm.reasoning(
          first
            ? "I will delegate repository inspection to an explore agent."
            : "I will ask a general agent to independently verify the result.",
        )
        yield llm.toolCall({
          index: 0,
          id: first ? "call_explore_ledger" : "call_verify_ledger",
          name: tool,
          input: subagentInput(
            tool,
            first ? "Explore the ledger" : "Verify the total",
            first
              ? "Read src/ledger.ts and report its exports and values."
              : "Independently calculate the total exported by src/ledger.ts.",
            first ? "explore" : "general",
          ),
        })
        yield llm.finish("tool-calls")
        return
      }

      if (phase === 1) {
        phase++
        yield llm.text(
          "The ledger exports credits containing 8, 13, and 21, plus a computed total.",
        )
        return
      }
      if (phase === 2) {
        phase++
        yield llm.text("First delegation complete: the explore agent inspected the ledger.")
        return
      }
      if (phase === 4) {
        phase++
        yield llm.text("The independent calculation is 8 + 13 + 21 = 42.")
        return
      }

      phase++
      yield llm.text("Second delegation complete: the general agent confirmed total 42.")
    })

    await ui.submit("Use an explore subagent to inspect src/ledger.ts.")
    await ui.waitFor("First delegation complete", { timeout: 30_000 })
    await Bun.sleep(250)
    await ui.screenshot("subagents-first-complete")

    await openSubagents(ui)
    await ui.waitFor("Subagents")
    await ui.enter()
    await ui.screenshot("subagents-child")
    await ui.press("escape")
    await ui.waitFor("First delegation complete")

    await ui.submit("Now use a general subagent to verify the total independently.")
    await ui.waitFor("Second delegation complete", { timeout: 30_000 })
    await Bun.sleep(250)
    await ui.screenshot("subagents-second-complete")
  },
})

async function openSubagents(ui: ScriptUi) {
  await ui.press("x", { ctrl: true })
  await ui.arrow("down")
}

function subagentTool(body: JsonValue) {
  const names = offeredTools(body)
  if (names.includes("subagent")) return "subagent"
  if (names.includes("task")) return "task"
  throw new Error(`OpenCode did not offer a subagent tool: ${names.join(", ")}`)
}

function subagentInput(
  tool: string,
  description: string,
  prompt: string,
  agent: string,
): JsonValue {
  if (tool === "subagent") return { agent, description, prompt }
  return { subagent_type: agent, description, prompt }
}

function offeredTools(body: JsonValue) {
  if (!isJsonObject(body)) return []
  const tools = body.tools
  if (!Array.isArray(tools)) return []
  return tools.flatMap((tool) => {
    if (!isJsonObject(tool)) return []
    const definition = tool.function
    if (!isJsonObject(definition) || typeof definition.name !== "string") return []
    return [definition.name]
  })
}

function isJsonObject(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTitleRequest(body: unknown) {
  return JSON.stringify(body).includes("title generator")
}
