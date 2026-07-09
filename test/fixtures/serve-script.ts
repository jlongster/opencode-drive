import { defineScript } from "../../src/index.js"

export default defineScript({
  async run({ llm }) {
    const completed = Promise.withResolvers<void>()
    llm.serve(async function* () {
      yield llm.reasoning("thinking", { delay: 0, chunkSize: 2 })
      yield llm.pause(1)
      yield llm.text("served response")
      yield llm.finish("length")
      completed.resolve()
    })
    await completed.promise
  },
})
