import { connectBackendSimulation } from "../client/index.js"

const response = "This is a sample response from opencode-drive."

export async function connectMockBackend(endpoint: string) {
  const backend = await connectBackendSimulation({ url: endpoint })
  let closing = false
  await backend.attach((request) => {
    void backend
      .chunk(request.id, [{ type: "textDelta", text: response }])
      .then(() => backend.finish(request.id))
      .catch((error) => {
        if (!closing)
          console.error(
            `error: ${error instanceof Error ? error.message : String(error)}`,
          )
      })
  })
  return {
    close() {
      closing = true
      backend.close()
    },
  }
}
