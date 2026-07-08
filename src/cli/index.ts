#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { api } from "./api.js"
import { extractCommands } from "./parse.js"
import { send } from "./send.js"
import { start } from "./start.js"
import { restart } from "./restart.js"
import { stop } from "./stop.js"
import { describe } from "./describe.js"
import type { DriveCommand, SendOptions, StartOptions } from "./types.js"

const extracted = extract()
const name = Flag.string("name").pipe(
  Flag.withDefault("default"),
  Flag.withDescription("Instance name"),
)

const startCommand = Command.make(
  "start",
  {
    name,
    daemon: Flag.boolean("daemon").pipe(
      Flag.withDescription("Run as detached instance owner"),
    ),
    script: Flag.string("script").pipe(
      Flag.optional,
      Flag.withDescription("JavaScript or TypeScript automation module"),
    ),
    visible: Flag.boolean("visible").pipe(
      Flag.withDescription("Show OpenCode in the terminal"),
    ),
    dev: Flag.string("dev").pipe(
      Flag.optional,
      Flag.withDescription("Path to an OpenCode development checkout"),
    ),
    state: Flag.string("state").pipe(
      Flag.optional,
      Flag.withDescription("Simulation snapshot containing files/"),
    ),
  },
  (config) =>
    execute(() =>
      start(toStartOptions(config, extracted.commands, extracted.app)),
    ),
).pipe(
  Command.withDescription("Launch a local simulated OpenCode instance"),
  Command.withExamples([
    {
      command: "opencode-drive start",
      description: "Launch headless OpenCode on the default ports",
    },
    {
      command: "opencode-drive start --visible",
      description: "Launch visible OpenCode on the default ports",
    },
    {
      command: "opencode-drive start --script ./drive.ts",
      description: "Launch headless OpenCode and run a script",
    },
  ]),
)

const sendCommand = Command.make("send", { name }, (config) =>
  execute(() =>
    send(toSendOptions(config.name, extracted.commands, extracted.app)),
  ),
).pipe(
  Command.withDescription("Send UI commands to OpenCode on the default port"),
  Command.withExamples([
    {
      command:
        'opencode-drive send --command.ui.type \'{"text":"hello"}\' --command.ui.state',
      description: "Execute an ordered UI command batch",
    },
  ]),
)

const apiCommand = Command.make("api", {}, () => execute(api)).pipe(
  Command.withDescription("Print the OpenCode drive UI protocol"),
)

const restartCommand = Command.make("restart", { name }, (config) =>
  execute(() => restart(config.name)),
).pipe(
  Command.withDescription(
    "Restart a named OpenCode instance and rerun its script",
  ),
)

const stopCommand = Command.make("stop", { name }, (config) =>
  execute(() => stop(config.name)),
).pipe(Command.withDescription("Stop a named OpenCode instance"))

const describeCommand = Command.make("describe", { name }, (config) =>
  execute(() => describe(config.name)),
).pipe(Command.withDescription("Describe a named OpenCode instance"))

const root = Command.make("opencode-drive").pipe(
  Command.withDescription("Drive real and simulated OpenCode instances"),
  Command.withSubcommands([
    startCommand,
    sendCommand,
    describeCommand,
    restartCommand,
    stopCommand,
    apiCommand,
  ]),
)

Command.runWith(root, { version: "0.1.0" })(extracted.args).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)

function toStartOptions(
  config: {
    readonly script: Option.Option<string>
    readonly name: string
    readonly daemon: boolean
    readonly visible: boolean
    readonly dev: Option.Option<string>
    readonly state: Option.Option<string>
  },
  commands: ReadonlyArray<DriveCommand>,
  app: ReadonlyArray<string>,
): StartOptions {
  if (commands.length > 0)
    throw new Error("start does not accept command flags; use send or --script")
  const options = {
    kind: "start" as const,
    name: config.name,
    daemon: config.daemon,
    script: Option.getOrUndefined(config.script),
    visible: config.visible,
    dev: Option.getOrUndefined(config.dev),
    state: Option.getOrUndefined(config.state),
    command: app,
  }
  if (options.dev !== undefined && app.length > 0)
    throw new Error("--dev cannot be combined with a command after --")
  return options
}

function toSendOptions(
  name: string,
  commands: ReadonlyArray<DriveCommand>,
  app: ReadonlyArray<string>,
): SendOptions {
  if (app.length > 0) throw new Error("send does not accept a command after --")
  return { kind: "send", name, commands }
}

function execute(task: () => Promise<void>) {
  return Effect.tryPromise({ try: task, catch: (error) => error }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(
          `error: ${error instanceof Error ? error.message : String(error)}`,
        )
        process.exitCode = 1
      }),
    ),
  )
}

function extract() {
  try {
    return extractCommands(process.argv.slice(2))
  } catch (error) {
    console.error(
      `opencode-drive: ${error instanceof Error ? error.message : String(error)}`,
    )
    return process.exit(1)
  }
}
