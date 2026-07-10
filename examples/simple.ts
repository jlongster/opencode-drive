import { defineScript } from "opencode-drive"

export default defineScript({
  async setup({ fs }) {
    await fs.writeFile(
      "src/message.ts",
      'export const message = "Hello from OpenCode Drive"\n',
    )
  },

  async run({ llm, ui }) {
    await ui.waitFor((state) => state.focused.editor)
    const editor = await ui.getElement({ editor: true, focused: true })
    await ui.focus(editor)

    await ui.submit("What does src/message.ts export?")
    await llm.send(
      llm.reasoning("I should inspect the small source file first.", {
        delay: 5,
        chunkSize: 10,
      }),
      llm.pause(100),
      llm.text(
        'src/message.ts exports `message` with the value "Hello from OpenCode Drive".',
        {
          delay: 10,
          chunkSize: 12,
        },
      ),
    )
    await llm.send(llm.text("Message export"))

    await ui.waitFor("Hello from OpenCode Drive")
    if (!(await ui.matches("OpenCode Drive")))
      throw new Error("the expected response was not visible")

    await ui.screenshot("simple-response")
  },
})
