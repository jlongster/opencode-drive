import { defineScript } from "opencode-drive"

export default defineScript({
  async setup({ fs }) {
    await fs.writeFile(
      "src/greeting.ts",
      [
        "export function greeting(name: string) {",
        '  return `Welcome, ${name}!`',
        "}",
        "",
      ].join("\n"),
    )
  },

  async run({ llm, ui }) {
    let turn = 0

    llm.serve(async function* (request) {
      if (isTitleRequest(request.body)) {
        yield { type: "textDelta", text: "Understanding the greeting" }
        return
      }

      if (turn++ === 0) {
        yield {
          type: "reasoningDelta",
          text: "I should read the implementation before explaining it.",
        }
        yield {
          type: "toolCall",
          index: 0,
          id: "call_read_greeting",
          name: "read",
          input: { filePath: "src/greeting.ts" },
        }
        yield { type: "finish", reason: "tool-calls" }
        return
      }

      for (const text of [
        "The function accepts a name, ",
        "places it into a welcome message, ",
        "and adds an exclamation mark.",
      ]) {
        yield { type: "textDelta", text }
        await Bun.sleep(150)
      }
      yield { type: "finish", reason: "stop" }
    })

    await ui.submit("Read src/greeting.ts and explain what it does.")
    await ui.waitFor("adds an exclamation mark")
  },
})

function isTitleRequest(body: unknown) {
  if (typeof body !== "object" || body === null || !("messages" in body))
    return false
  const messages = body.messages
  return (
    Array.isArray(messages) &&
    messages.some(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "content" in message &&
        typeof message.content === "string" &&
        message.content.includes("You are a title generator"),
    )
  )
}
