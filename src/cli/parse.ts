import { commandAcceptsValue } from "./commands.js"
import type { DriveCommand } from "./types.js"

export function extractCommands(args: ReadonlyArray<string>) {
  const commands: DriveCommand[] = []
  const remaining: string[] = []
  const separator = args.indexOf("--")
  const cli = separator === -1 ? args : args.slice(0, separator)
  const app = separator === -1 ? [] : args.slice(separator + 1)

  for (let index = 0; index < cli.length; index++) {
    const flag = cli[index]!
    if (!flag.startsWith("--command.")) {
      remaining.push(flag)
      continue
    }
    const operation = flag.slice("--command.".length)
    const acceptsValue = commandAcceptsValue(operation)
    const value = acceptsValue ? cli[++index] : undefined
    if (acceptsValue && (value === undefined || value.startsWith("--"))) throw new Error(`${flag} requires a value`)
    commands.push({ operation, ...(value === undefined ? {} : { value }) })
  }
  return { args: remaining, app, commands }
}
