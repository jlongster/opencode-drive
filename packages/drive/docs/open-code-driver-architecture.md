# OpenCode Driver Architecture

This guide describes the current Effect-native architecture. The public call
sites are documented in [OpenCode Driver API](./open-code-driver-api.md).

## Domain Model

`OpenCodeDriver` composes four resources:

```text
OpenCodeDriver
  project       isolated files and configuration
  opencode      generated OpenCode SDK client
  tui           primary frontend process
  tuis          additional frontend process factory
  ui            convenience alias for tui.ui
  llm           shared simulated-model control
```

The names distinguish the two kinds of client involved:

- `opencode` is the generated `@opencode-ai/client` SDK value.
- `Tui` is a launched OpenCode frontend process with `ui`, `close`, and an
  optional `recording`.
- `Tuis` launches and supervises additional frontend processes connected to
  the same server.
- Transport-level JSON-RPC clients remain private implementation details.

`defineScript` consumes these exact capabilities. It adds a branded module
contract, restart behavior, filesystem access, and explicit manual launch. It
does not define another UI, TUI, LLM, or project vocabulary.

## Ownership

```text
Effect Scope
  OpenCodeProject
    artifact root
    isolated project files
  OpenCodeInstance
    server process
    TUI processes
    launch descriptors and logs
  OpenCodeServer
    backend simulation connection
    LLM controller
    generated OpenCode SDK connection
    TUI supervisor
      primary TUI scope
      additional TUI scopes
```

`OpenCodeDriver.make(options)` requires `Scope.Scope`. It returns once the
server, generated SDK client, primary TUI, and simulation connections are
ready. `OpenCodeDriver.use` supplies that scope and performs terminal
settlement even when the user program fails.

## Settlement

Settlement is one shared terminal operation. It runs in this order:

1. Validate that queued LLM work was consumed.
2. Shut down the LLM controller.
3. Finish active recording timelines.
4. Close all TUI scopes and processes.
5. Export completed recordings.
6. Decode the schema-validated `RunReport`.

`driver.settle()` is shared and idempotent. Once settlement starts, `tuis`
rejects new launches and `llm` rejects new responses. `OpenCodeDriver.use`
combines a user-program failure with a settlement failure rather than hiding
either cause.

## TUI Lifecycle

`Tuis.launch(options)` generates an internal identity. `Tuis.launch(name,
options)` uses a stable caller-supplied identity. Both return the same value:

```ts
interface Tui {
  readonly ui: Ui
  readonly close: () => Effect.Effect<void>
  readonly recording?: Recording
}
```

Each TUI owns one frontend process, one negotiated UI connection, and
optionally one recording timeline. Closing a named TUI releases its identity
for reuse. An unexpected process exit fails the owning driver or script.

The primary TUI is not a special interface. `driver.tui` and values returned
by `driver.tuis` have exactly the same `Tui` type. `driver.ui` is only
`driver.tui.ui` exposed for the common single-TUI call site.

## OpenCode SDK

The server process writes an authenticated service registration into its
isolated state directory. `driver/opencode.ts` discovers that registration and
constructs the generated Effect SDK client with the project directory header.
Passwords and registration paths remain internal. The resulting value is
exposed as `driver.opencode` and `ScriptContext.opencode`.

## Canonical Protocol

`simulation/protocol.ts` contains the single schema definition for OpenCode's
handshake, frontend, and backend simulation messages. `client/protocol.ts`
publishes those namespaces without redefining their data types.

```text
Frontend protocol schemas
  -> driver/ui.ts        Effect Ui capability
  -> driver/client.ts    Tui and Tuis lifecycle
  -> driver/index.ts     OpenCodeDriver aggregate
  -> script/types.ts     exact capability reuse
```

CLI `--command.ui.*` names are exhaustively checked against
`Frontend.Capabilities`. The Promise transport under `opencode-drive/client`
is separate from the Effect programmatic model but consumes the same protocol
schemas.

## Transport Seam

`SimulationConnector` owns WebSocket acquisition, handshake negotiation,
schema validation, request correlation, interruption, and connection failure.
The driver receives the connector through an Effect service and does not
expose it in userland.

The UI connection is request-response JSON-RPC. The backend additionally
receives unsolicited `llm.request` notifications and exposes them as a
validated stream to the LLM controller.

## Project Setup

Neutral project contracts live in `src/project.ts` so neither the driver nor
scripts own the shared vocabulary:

```text
Project
Setup
SetupContext
ProjectFileSystem
OpenCodeConfig
OpenCodeTuiConfig
```

Configuration is applied in this order:

1. Write declared project files.
2. Read fixture `opencode.jsonc` and `tui.jsonc` values.
3. Deep-merge `config` and `tuiConfig`; arrays replace existing arrays.
4. Run Effect-only `setup`, which may mutate both merged objects.
5. Write normalized JSON and optionally commit the Git baseline.

## Dependency Direction

```text
project     -> Effect and Schema
simulation  -> canonical protocol and Effect RPC
driver      -> project + simulation + instance + recording
script      -> project + driver capabilities
cli         -> script + driver + Promise transport
```

Lower-level modules do not import the package root or the driver/script
barrels. `script/types.ts` may reference driver capabilities; driver modules
must not reference script types.

## Public Entry Points

- `opencode-drive`: Effect driver, scripts, project contracts, LLM constructors.
- `opencode-drive/driver`: complete Effect driver namespace.
- `opencode-drive/script`: `defineScript` and script contracts.
- `opencode-drive/client`: Promise simulation transport.
- `opencode-drive/llm`: pure LLM output constructors and schemas.
- `opencode-drive/recording`: recording decode, replay, and export utilities.
