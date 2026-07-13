import { join } from "node:path"
import { defineScript } from "../../src/index.js"

export default defineScript({
  project: {
    git: true,
    files: {
      "src/seeded.ts": "export const seeded = true\n",
    },
  },
  async setup({ fs, config }) {
    config.autoupdate = false
    await fs.writeFile("setup-seeded.txt", "included in baseline\n")
  },

  async run({ artifacts, fs, llm, ui }) {
    const gitWriteError = await fs
      .writeFile(".GIT/config", "no")
      .then(() => undefined)
      .catch((error: unknown) => String(error))
    const editor = await ui.getElement(1)
    await ui.focus(editor)
    await ui.click(editor)
    await ui.submit("script-text")
    await llm.send(llm.text("script response", { delay: 0, chunkSize: 3 }))
    const matches = await ui.matches("script-text")
    await ui.waitFor("script-text")
    await ui.screenshot("script-shot")
    const state = await ui.state()
    await Bun.write(
      join(artifacts, "script-result.json"),
      `${JSON.stringify({ focused: state.focused, gitWriteError, matches }, undefined, 2)}\n`,
    )
  },
})
