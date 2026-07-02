# opencode-probe

Generates probe data against the latest local OpenCode checkout.

The `opencode-latest` symlink points at `~/projects/opencode-latest`, a checkout of `anomalyco/opencode`. Probe code imports source files from that checkout so generation tracks the current OpenCode tree.

```sh
bun install
bun run generate            # 8 configs, seed 42
bun run generate 4 7        # 4 configs, seed 7
bun run check               # lint + typecheck
bun run update:opencode     # pull latest opencode + reinstall its deps
```

## Architecture

Three layers, built for model-based testing:

```text
Initial State                      Model                       Client
  config.json                        simplified expected         drives OpenCode's simulation
  virtual filesystem        ->       state derived from    ->    WebSocket control server
  environment                        the initial state           (OPENCODE_SIMULATION=1)
```

The source is grouped into these sections:

- `src/generators/` — initial-state generation
  - `random.ts` — deterministic seeded RNG (no fast-check)
  - `config.ts` — profile-based realistic config generation
    (`minimal`, `typical`, `maximal`, `edge`)
  - `filesystem.ts` — virtual files coherent with the config
    (skills referenced by `config.skills` actually exist, etc.)
  - `initial-state.ts` — `{ config, files, env }` bundles
  - `generate.ts` — batch generation; every config is validated against the
    latest checkout's `Config.Info` schema at runtime
- `src/model/` — the expected-state model
  - `model.ts` — `ProbeModel`, the facts we assert against OpenCode
  - `derive.ts` — `deriveModel(initialState)` interprets config + files
- `src/client/` — simulation control client
  - `protocol.ts` — wire types mirroring OpenCode's
    `packages/tui/src/simulation` JSON-RPC WebSocket protocol
  - `client.ts` — `SimulationClient`: typed wrappers for every server method
    (`ui.state`, `ui.action`, `ui.render`, `trace.list`, `trace.clear`,
    `trace.export`) plus per-action helpers (`typeText`, `pressEnter`, ...)

`src/index.ts` re-exports all three sections. The CLI (`src/cli.ts`) prints
plain OpenCode `config.json` objects only.

## Driving a running OpenCode

Start OpenCode from the checkout with simulation enabled, then connect:

```ts
import { connectSimulation } from "opencode-probe"

const client = await connectSimulation() // scans ws://127.0.0.1:40900+
const state = await client.render()
await client.typeText("hello")
const trace = await client.traceExport()
client.close()
```

## Invariant

```ts
const config = generateConfigJson({ seed, profile })
const files = generateFilesForConfig(config, seed)
const model = deriveModel({ config, files, env })
```

Anything the config references must exist in the generated files, and
`deriveModel` must reflect how OpenCode itself would interpret that state.
