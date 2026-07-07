---
name: opencode-drive
description: Start and drive OpenCode instances for UI testing, simulation, screenshots, recordings, and development verification.
---

# OpenCode Drive

Use `opencode-drive` to automate OpenCode through its drive WebSockets.

## Start

Start one headless simulated instance on the fixed default ports:

```bash
bunx opencode-drive start
```

Add `--visible` to render the TUI in the current terminal.

Only one driven instance can run at a time.

Non-scripted starts automatically attach a basic mock model. Use `--script` to control LLM responses yourself.

Visible starts support `opencode-drive restart`. Restart replaces the OpenCode child and reruns its script. Headless script runs exit when complete and do not support restart.

## Drive The UI

```bash
bunx opencode-drive send \
  --command.ui.type '{"text":"Explain this project briefly"}' \
  --command.ui.enter

bunx opencode-drive send --command.ui.state
bunx opencode-drive send --command.ui.screenshot
```

Run `opencode-drive api` for the complete UI command API. LLM simulation is intentionally unavailable through `send`.

## Scripted Simulation

Use a script when controlling simulated LLM exchanges:

```bash
bunx opencode-drive start --script ./drive.ts
```

The script default-exports a function that receives connected clients:

```ts
import { defineScript } from "opencode-drive"

export default defineScript(async ({ ui, backend, artifacts }) => {
  await backend.attach(async (request) => {
    await backend.chunk(request.id, [{ type: "textDelta", text: "hello" }])
    await backend.finish(request.id)
  })
  await ui.typeText("Say hello")
  await ui.pressEnter()
})
```

The command reports the artifact and log directories when it exits.

## UI Commands

- `--command.ui.type <json>`
- `--command.ui.press <json>`
- `--command.ui.enter`
- `--command.ui.arrow <json>`
- `--command.ui.focus <json>`
- `--command.ui.click <json>`
- `--command.ui.state`
- `--command.ui.screenshot`
- `--command.ui.start-record`
- `--command.ui.end-record`
