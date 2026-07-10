import { defineScript } from "../../src/index.js"

export default defineScript({
  launch: "manual",
  async run({ server, llm }) {
    llm.title(() => "Custom title")
    await server.launch()
    await llm.send(llm.text("Normal response"))
  },
})
