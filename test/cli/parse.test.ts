import { describe, expect, test } from "bun:test"
import { extractCommands } from "../../src/cli/parse.js"

describe("drive CLI parser", () => {
  test("preserves namespaced command order", () => {
    expect(extractCommands([
      "send",
      "--name",
      "demo",
      "--command.ui.type",
      '{"text":"hello"}',
      "--command.ui.screenshot",
      "--command.ui.state",
    ])).toEqual({
      args: ["send", "--name", "demo"],
      app: [],
      commands: [
        { operation: "ui.type", value: '{"text":"hello"}' },
        { operation: "ui.screenshot" },
        { operation: "ui.state" },
      ],
    })
  })

  test("keeps the custom OpenCode argv intact", () => {
    expect(extractCommands(["start", "--name", "demo", "--", "bun", "app.ts", "--standalone", "--help"])).toEqual({
      args: ["start", "--name", "demo"],
      app: ["bun", "app.ts", "--standalone", "--help"],
      commands: [],
    })
  })

  test("rejects unknown namespaced commands", () => {
    expect(() => extractCommands(["send", "--command.unknown"])).toThrow("unknown drive command")
  })
})
