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
Initial State                      Model                       Commands (later)
  config.json                        simplified expected         actions against OpenCode
  virtual filesystem        ->       state derived from    ->    expected model transitions
  environment                        the initial state
```

- `src/generators/random.ts` — deterministic seeded RNG (no fast-check)
- `src/generators/config.ts` — profile-based realistic config generation
  (`minimal`, `typical`, `maximal`, `edge`)
- `src/generators/filesystem.ts` — virtual files coherent with the config
  (skills referenced by `config.skills` actually exist, etc.)
- `src/generators/initial-state.ts` — `{ config, files, env }` bundles
- `src/model/model.ts` — `ProbeModel`, the facts we assert against OpenCode
- `src/model/derive.ts` — `deriveModel(initialState)` interprets config + files
- `src/generate.ts` — public API; every generated config is validated against
  the latest checkout's `Config.Info` schema at runtime

The CLI (`src/index.ts`) prints plain OpenCode `config.json` objects only.

## Invariant

```ts
const config = generateConfigJson({ seed, profile })
const files = generateFilesForConfig(config, seed)
const model = deriveModel({ config, files, env })
```

Anything the config references must exist in the generated files, and
`deriveModel` must reflect how OpenCode itself would interpret that state.
