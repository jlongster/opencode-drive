import { defineScript, wait } from "../../src/index.js"

export default defineScript({
  launch: "manual",
  async run({ server, clients, artifacts }) {
    await server.launch()
    const firstServer = Number(await Bun.file(`${artifacts}/service.pid`).text())
    const [alice, bob] = await Promise.all([
      clients.launch("alice"),
      clients.launch("bob"),
    ])

    await server.kill()
    for (let attempt = 0; attempt < 100 && running(firstServer); attempt++)
      await wait(10)
    if (running(firstServer)) throw new Error("the first server is still running")

    await server.launch()
    const secondServer = Number(await Bun.file(`${artifacts}/service.pid`).text())
    if (secondServer === firstServer) throw new Error("the server was not relaunched")

    await Promise.all([alice.kill(), bob.kill()])
    const relaunchedAlice = await clients.launch("alice")
    await relaunchedAlice.kill()
    await server.kill()

    await Bun.write(
      `${artifacts}/kill-server-result.json`,
      JSON.stringify({ firstServer, secondServer }),
    )
  },
})

function running(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
