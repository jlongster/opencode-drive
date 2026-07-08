interface DriveContext {
  readonly ui: {
    typeText(text: string): Promise<unknown>
    pressEnter(): Promise<unknown>
    screenshot(): Promise<string>
  }
  readonly backend: {
    attach(
      onRequest: (request: { readonly id: string }) => void | Promise<void>,
    ): Promise<unknown>
    chunk(
      id: string,
      items: ReadonlyArray<{
        readonly type: "textDelta"
        readonly text: string
      }>,
    ): Promise<unknown>
    finish(id: string, reason: "content-filter"): Promise<unknown>
  }
}

export default async function driveContentFilter({
  ui,
  backend,
}: DriveContext) {
  const finished = Promise.withResolvers<void>()

  await backend.attach(async (request) => {
    await backend.chunk(request.id, [
      {
        type: "textDelta",
        text: "This partial response arrived before the provider blocked the rest.",
      },
    ])
    await backend.finish(request.id, "content-filter")
    finished.resolve()
  })

  await ui.typeText("Reproduce a provider content-filter finish")
  await ui.pressEnter()
  const timeout = setTimeout(
    () =>
      finished.reject(
        new Error("timed out waiting for the simulated LLM request"),
      ),
    30_000,
  )
  await finished.promise.finally(() => clearTimeout(timeout))
  await Bun.sleep(500)

  console.log(`Screenshot: ${await ui.screenshot()}`)
}
