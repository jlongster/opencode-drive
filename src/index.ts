import { Effect } from "effect"
import { generateConfigs } from "./generate.js"

const count = Number(process.argv[2] ?? "8")
const seed = Number(process.argv[3] ?? "42")

const program = generateConfigs({ count, seed }).pipe(
  Effect.tap((configs) => Effect.sync(() => console.log(JSON.stringify(configs, undefined, 2)))),
)

await Effect.runPromise(program)
