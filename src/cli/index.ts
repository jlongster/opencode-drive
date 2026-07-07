#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { CommandBatchError } from "./commands.js"
import { connect } from "./connect.js"
import { extractCommands } from "./parse.js"
import { run } from "./run.js"
import type { ConnectOptions, DriveCommand, RunOptions } from "./types.js"

const extracted = extract()
const name = Flag.string("name").pipe(Flag.optional, Flag.withDescription("Instance name"))
const driver = Flag.string("driver").pipe(Flag.optional, Flag.withDescription("TypeScript driver module"))

const runCommand = Command.make("run", {
  name,
  driver,
  campaign: Flag.string("campaign").pipe(Flag.optional, Flag.withDescription("Campaign module")),
  seed: Flag.integer("seed").pipe(Flag.withDefault(Date.now() % 1_000_000)),
  caseIndex: Flag.integer("case").pipe(
    Flag.filter((value) => value >= 0, () => "Case must be non-negative"),
    Flag.optional,
  ),
  count: Flag.integer("count").pipe(
    Flag.filter((value) => value > 0, () => "Count must be greater than zero"),
    Flag.optional,
  ),
  concurrency: Flag.integer("concurrency").pipe(
    Flag.filter((value) => value > 0, () => "Concurrency must be greater than zero"),
    Flag.withDefault(1),
  ),
  visible: Flag.boolean("visible").pipe(Flag.withDescription("Show OpenCode in the terminal")),
  dev: Flag.string("dev").pipe(Flag.optional, Flag.withDescription("Path to an OpenCode development checkout")),
  state: Flag.string("state").pipe(Flag.optional, Flag.withDescription("Simulation snapshot containing files/")),
  anchor: Flag.string("anchor").pipe(Flag.optional),
}, (config) => execute(() => run(toRunOptions(config, extracted.commands, extracted.app)))).pipe(
  Command.withDescription("Launch and own a local simulated OpenCode instance"),
  Command.withExamples([
    { command: "opencode-drive run --name demo --visible", description: "Launch a visible simulated instance" },
    { command: "opencode-drive run --command.render", description: "Launch, render once, and exit" },
  ]),
)

const connectCommand = Command.make("connect", { name, driver }, (config) =>
  execute(() => connect(toConnectOptions(config, extracted.commands, extracted.app)))).pipe(
    Command.withDescription("Connect to an existing drive-enabled OpenCode instance"),
    Command.withExamples([
      {
        command: "opencode-drive connect --name demo --command.type hello --command.press enter --command.render",
        description: "Execute an ordered command batch",
      },
    ]),
  )

const root = Command.make("opencode-drive").pipe(
  Command.withDescription("Drive real and simulated OpenCode instances"),
  Command.withSubcommands([runCommand, connectCommand]),
)

Command.runWith(root, { version: "0.1.0" })(extracted.args).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)

function toRunOptions(
  config: {
    readonly name: Option.Option<string>
    readonly driver: Option.Option<string>
    readonly campaign: Option.Option<string>
    readonly seed: number
    readonly caseIndex: Option.Option<number>
    readonly count: Option.Option<number>
    readonly concurrency: number
    readonly visible: boolean
    readonly dev: Option.Option<string>
    readonly state: Option.Option<string>
    readonly anchor: Option.Option<string>
  },
  commands: ReadonlyArray<DriveCommand>,
  app: ReadonlyArray<string>,
): RunOptions {
  const options = {
    kind: "run" as const,
    name: Option.getOrUndefined(config.name),
    driver: Option.getOrUndefined(config.driver),
    campaign: Option.getOrUndefined(config.campaign),
    seed: config.seed,
    caseIndex: Option.getOrUndefined(config.caseIndex),
    count: Option.getOrUndefined(config.count),
    concurrency: config.concurrency,
    visible: config.visible,
    dev: Option.getOrUndefined(config.dev),
    state: Option.getOrUndefined(config.state),
    anchor: Option.getOrUndefined(config.anchor),
    command: app,
    commands,
  }
  assertExecutionMode(options.driver, options.campaign, commands)
  if (options.dev !== undefined && app.length > 0) throw new Error("--dev cannot be combined with a command after --")
  if (options.caseIndex !== undefined && options.campaign === undefined) throw new Error("--case requires --campaign")
  if (options.visible && options.campaign !== undefined && options.caseIndex === undefined) {
    throw new Error("visible campaign runs require --case")
  }
  return options
}

function toConnectOptions(
  config: { readonly name: Option.Option<string>; readonly driver: Option.Option<string> },
  commands: ReadonlyArray<DriveCommand>,
  app: ReadonlyArray<string>,
): ConnectOptions {
  if (app.length > 0) throw new Error("connect does not accept a command after --")
  const options = {
    kind: "connect" as const,
    name: Option.getOrUndefined(config.name),
    driver: Option.getOrUndefined(config.driver),
    commands,
  }
  assertExecutionMode(options.driver, undefined, commands)
  return options
}

function assertExecutionMode(driver: string | undefined, campaign: string | undefined, commands: ReadonlyArray<DriveCommand>) {
  const count = Number(driver !== undefined) + Number(campaign !== undefined) + Number(commands.length > 0)
  if (count > 1) throw new Error("command flags, --driver, and --campaign are mutually exclusive")
}

function execute(task: () => Promise<void>) {
  return Effect.tryPromise({ try: task, catch: (error) => error }).pipe(
    Effect.catch((error) => Effect.sync(() => {
      if (error instanceof CommandBatchError) {
        console.error(JSON.stringify({ name: error.instance, results: error.results, error: error.message }, undefined, 2))
      } else {
        console.error(`opencode-drive: ${error instanceof Error ? error.message : String(error)}`)
      }
      process.exitCode = 1
    })),
  )
}

function extract() {
  try {
    return extractCommands(process.argv.slice(2))
  } catch (error) {
    console.error(`opencode-drive: ${error instanceof Error ? error.message : String(error)}`)
    return process.exit(1)
  }
}
