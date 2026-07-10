import { defineScript, wait } from "../../src/index.js"

export default defineScript({
  async run({ ui }) {
    try {
      await ui.waitFor("this text never appears", { timeout: 50 })
    } catch {
      await wait(30_000)
    }
  },
})
