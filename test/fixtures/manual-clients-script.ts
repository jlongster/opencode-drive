import { defineScript } from "../../src/index.js"

export default defineScript({
  launch: "manual",
  async run({ ui, server, clients, artifacts }) {
    if (ui !== null) throw new Error("manual scripts must not receive a default UI")
    const clientBeforeServer = await clients
      .launch("too-early")
      .then(() => "unexpected success")
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
    await server.launch()
    const duplicateServer = await server
      .launch()
      .then(() => "unexpected success")
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
    const [alice, bob] = await Promise.all([
      clients.launch("alice"),
      clients.launch("bob"),
    ])
    await alice.submit("from alice")
    await bob.submit("from bob")
    const [aliceMatches, bobMatches, aliceScreenshot, bobScreenshot] =
      await Promise.all([
        alice.matches("client-alice"),
        bob.matches("client-bob"),
        alice.screenshot("alice"),
        bob.screenshot("bob"),
      ])
    await Bun.write(
      `${artifacts}/manual-clients.json`,
      JSON.stringify({
        aliceMatches,
        bobMatches,
        clientBeforeServer,
        duplicateServer,
        aliceScreenshot,
        bobScreenshot,
      }),
    )
  },
})
