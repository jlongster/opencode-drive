import { defineScript } from "../../src/index.js"

export default defineScript({
  async run({ artifacts, llm, signal }) {
    llm.serve(async function* () {
      await Bun.sleep(500)
      yield llm.text("late response")
    })
    const file = `${artifacts}/script-runs.txt`
    await Bun.write(
      file,
      `${await Bun.file(file)
        .text()
        .catch(() => "")}run\n`,
    )
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true })
    })
  },
})
