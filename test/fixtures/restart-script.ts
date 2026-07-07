import { defineScript } from "../../src/index.js"

export default defineScript(async ({ artifacts, backend }) => {
  await backend.attach(async (request) => {
    await Bun.sleep(500)
    await backend.chunk(request.id, [
      { type: "textDelta", text: "late response" },
    ])
    await backend.finish(request.id)
  })
  const file = `${artifacts}/script-runs.txt`
  await Bun.write(
    file,
    `${await Bun.file(file)
      .text()
      .catch(() => "")}run\n`,
  )
})
