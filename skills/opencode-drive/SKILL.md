---
name: opencode-drive
description: Start and drive OpenCode instances for UI testing, simulation, screenshots, recordings, and development verification.
---

# OpenCode Drive

Start a uniquely named detached instance:

```bash
bunx opencode-drive start --name demo
```

Drive it by name:

```bash
bunx opencode-drive send --name demo \
  --command.ui.type '{"text":"Explain this project briefly"}' \
  --command.ui.enter

bunx opencode-drive send --name demo --command.ui.state
bunx opencode-drive send --name demo --command.ui.screenshot
```

Use `opencode-drive api` for the full UI command API. Non-scripted instances automatically use a basic mock model.

Use a script for custom LLM behavior:

```bash
bunx opencode-drive start --name demo --script ./drive.ts
```

Scripted starts remain in the foreground and exit when the script completes.

Manage the instance lifecycle:

```bash
bunx opencode-drive describe --name demo
bunx opencode-drive restart --name demo
bunx opencode-drive stop --name demo
```

Restart reruns the instance script. Always stop instances when finished.
