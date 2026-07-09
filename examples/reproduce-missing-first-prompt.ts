import { basename, join } from "node:path"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { connectSimulation, defineScript } from "../src/index.js"
import { splitText } from "../src/cli/mock-backend.js"
import { createResponseSettings, generateResponse } from "../src/cli/response-generator.js"

const prompt = "FIRST PROMPT MUST BE VISIBLE"

export default defineScript(async ({ artifacts, backend, ui }) => {
  const url = ui.url
  ui.close()
  await Bun.sleep(4_000)
  const completed = deferred()
  const responses = createResponseSettings()
  await backend.attach(async (request) => {
    const response = generateResponse(responses.current(), request)
    for (const item of response.items) {
      if (item.type !== "textDelta" && item.type !== "reasoningDelta") {
        await backend.chunk(request.id, [item])
        continue
      }
      for (const text of splitText(item.text)) {
        await backend.chunk(request.id, [{ ...item, text }])
        await Bun.sleep(45 + Math.floor(Math.random() * 35))
      }
    }
    await backend.finish(request.id, response.finish)
    if (response.finish === "stop" && !isTitleRequest(request.body)) completed.resolve()
  })

  const control = await connectSimulation({ url })
  await control.typeText(prompt)
  await control.pressEnter()
  await waitFor(completed.promise)
  await Bun.sleep(250)

  const screenshot = await control.screenshot(`missing-first-prompt-${basename(artifacts)}`)
  control.close()
  const image = await loadImage(screenshot)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext("2d")
  context.drawImage(image, 0, 0)
  const sample = context.getImageData(30, 25, image.width - 60, 50).data
  let cardPixels = 0
  for (let i = 0; i < sample.length; i += 4) {
    if (
      sample[i] >= 20 &&
      sample[i] <= 30 &&
      sample[i + 1] >= 20 &&
      sample[i + 1] <= 30 &&
      sample[i + 2] >= 20 &&
      sample[i + 2] <= 30
    ) {
      cardPixels++
    }
  }
  const cardPixelRatio = cardPixels / (sample.length / 4)
  const timeline = context.getImageData(20, 0, image.width - 40, 320).data
  let responsePixels = 0
  for (let i = 0; i < timeline.length; i += 4) {
    if ((timeline[i] + timeline[i + 1] + timeline[i + 2]) / 3 > 60) responsePixels++
  }
  const responsePixelRatio = responsePixels / (timeline.length / 4)
  const reproduced = cardPixelRatio < 0.5 && responsePixelRatio > 0.001

  await Bun.write(
    join(artifacts, "missing-first-prompt-result.json"),
    `${JSON.stringify({ reproduced, cardPixelRatio, responsePixelRatio, screenshot }, undefined, 2)}\n`,
  )

  if (!reproduced) {
    throw new Error(
      `missing-prompt state not observed (card ${cardPixelRatio.toFixed(3)}, response ${responsePixelRatio.toFixed(3)})`,
    )
  }
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function waitFor(promise: Promise<void>) {
  const completed = await Promise.race([
    promise.then(() => true),
    Bun.sleep(30_000).then(() => false),
  ])
  if (!completed) throw new Error("timed out waiting for the assistant response")
}

function isTitleRequest(body: unknown) {
  if (typeof body !== "object" || body === null || !("messages" in body)) return false
  const messages = body.messages
  if (!Array.isArray(messages)) return false
  return messages.some(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "content" in message &&
      typeof message.content === "string" &&
      message.content.includes("You are a title generator"),
  )
}
