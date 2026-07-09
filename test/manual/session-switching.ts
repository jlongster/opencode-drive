import { defineScript, type ScriptUi } from "../../src/index.js"

export default defineScript({
  async setup({ fs }) {
    await fs.writeFile(
      "src/garden.ts",
      [
        "export const flowers = [\"aster\", \"dahlia\", \"iris\"]",
        "export const count = flowers.length",
        "",
      ].join("\n"),
    )
  },

  async run({ llm, ui }) {
    let phase = 0
    let title = 0

    llm.serve(async function* (request) {
      if (isTitleRequest(request.body)) {
        yield llm.text(title++ === 0 ? "Garden inventory" : "Project follow-up")
        return
      }

      if (phase === 0) {
        phase++
        yield llm.reasoning("I should read the source before answering.")
        yield llm.toolCall({
          index: 0,
          id: "call_read_garden",
          name: "read",
          input: { filePath: "src/garden.ts" },
        })
        yield llm.finish("tool-calls")
        return
      }
      if (phase === 1) {
        phase++
        yield llm.text(
          "Session one complete: the garden contains aster, dahlia, and iris.",
        )
        return
      }
      if (phase === 2) {
        phase++
        yield llm.reasoning("I will search for the exported count.")
        yield llm.toolCall({
          index: 0,
          id: "call_grep_count",
          name: "grep",
          input: { pattern: "count", path: "src", include: "*.ts" },
        })
        yield llm.finish("tool-calls")
        return
      }
      if (phase === 3) {
        phase++
        yield llm.text("Session two complete: the project exports count from src/garden.ts.")
        return
      }

      yield llm.text("Back in session one: there are exactly three flowers.")
    })

    await ui.submit("Read src/garden.ts and list every flower.")
    await ui.waitFor("Session one complete", { timeout: 20_000 })
    await ui.screenshot("sessions-first")

    await leader(ui, "n")
    await ui.waitFor((state) => state.focused.editor)
    await ui.submit("Find where the project exports count.")
    await ui.waitFor("Session two complete", { timeout: 20_000 })
    await ui.screenshot("sessions-second")

    await leader(ui, "l")
    await ui.waitFor("Sessions")
    await ui.arrow("down")
    await ui.enter()
    await ui.waitFor("Session one complete")

    await ui.submit("How many flowers were there?")
    await ui.waitFor("exactly three flowers", { timeout: 20_000 })
    await ui.screenshot("sessions-returned")
  },
})

async function leader(
  ui: ScriptUi,
  key: string,
) {
  await ui.press("x", { ctrl: true })
  await ui.press(key)
}

function isTitleRequest(body: unknown) {
  return JSON.stringify(body).includes("title generator")
}
