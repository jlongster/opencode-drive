---
name: opencode-drive
description: Start and drive OpenCode instances for UI testing, simulation, screenshots, recordings, and development verification.
---

# OpenCode Drive

Use `opencode-drive` to automate OpenCode through its drive WebSockets.

## Use Cases

- Test the TUI without manual input.
- Run isolated simulated instances.
- Drive an existing real or development instance.
- Capture screenshots or recordings.
- Inspect or answer simulated LLM requests.

## Start

Always use `--name` to give the instance a unique name:

```bash
bunx opencode-drive start --name demo
```

## Drive The UI

```bash
# Type and submit a prompt
bunx opencode-drive send --name demo \
  --command.ui.type '{"text":"Explain this project briefly"}' \
  --command.ui.enter

# Read structural UI state
bunx opencode-drive send --name demo --command.ui.state

# Take a screenshot; prints the PNG path
bunx opencode-drive send --name demo --command.ui.screenshot
```

## Command Actions

For full details of the available commands, run `opencode-drive api` to see the full API. 

- `--command.ui.type <json>`: Type text with `{"text":"hello"}`.
- `--command.ui.press <json>`: Press a key with `{"key":"x","modifiers":{"ctrl":true}}`.
- `--command.ui.enter`: Press Enter.
- `--command.ui.arrow <json>`: Press an arrow with `{"direction":"down"}`.
- `--command.ui.focus <json>`: Focus with `{"target":1}`.
- `--command.ui.click <json>`: Click with `{"target":1,"x":10,"y":5}`.
- `--command.ui.state`: Return focus, elements, and available actions as JSON.
- `--command.ui.screenshot`: Take a screenshot and print its PNG path.
- `--command.ui.start-record`: Start recording the UI.
- `--command.ui.end-record`: Stop recording and print the recording path.
- `--command.llm.pending`: List pending simulated LLM exchanges.
- `--command.llm.chunk <json>`: Send `{"id":"ex_1","items":[...]}` response items.
- `--command.llm.finish <json>`: Finish with `{"id":"ex_1","reason":"stop"}`.
- `--command.llm.disconnect <json>`: Disconnect with `{"id":"ex_1"}`.

## Logs

To inspect logs, run `opencode-drive describe --name demo` to get the log paths. `demo` is just an example name here, make sure you always pass the correct instance name.

## Stopping

When you are finished driving the app, make sure you stop the instance:

```bash
bunx opencode-drive stop --name demo
```
