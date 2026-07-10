import { defineScript, wait } from "opencode-drive"

export default defineScript({
  launch: "manual",

  async run({ server, clients, llm }) {
    await server.launch()

    llm.serve((_request, index) => [
      llm.text(`Response for request ${index + 1}`),
    ])

    const [alice, bob] = await Promise.all([
      clients.launch("alice"),
      clients.launch("bob"),
    ])

    await Promise.all([
      alice.submit("Reply to Alice"),
      bob.submit("Reply to Bob"),
    ])

    await Promise.all([
      alice.screenshot("multiple-clients-alice-submitted"),
      bob.screenshot("multiple-clients-bob-submitted"),
    ])

    await Promise.all([
      alice.waitFor("Response for request"),
      bob.waitFor("Response for request"),
    ])

    await Promise.all([
      alice.screenshot("multiple-clients-alice-complete"),
      bob.screenshot("multiple-clients-bob-complete"),
    ])

    await server.kill()
    await wait(500)
    await Promise.all([
      alice.screenshot("multiple-clients-alice-server-stopped"),
      bob.screenshot("multiple-clients-bob-server-stopped"),
    ])

    await server.launch()
    await wait(1000)
    await Promise.all([
      alice.screenshot("multiple-clients-alice-server-relaunched"),
      bob.screenshot("multiple-clients-bob-server-relaunched"),
    ])
  },
})
