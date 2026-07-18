# TUI regression probes

These scripts exercise real OpenCode TUI behavior against a compatible local checkout. They are manual while OpenCode Drive and OpenCode live in separate repositories and protocol revisions can drift.

From the repository root, set `OPENCODE_DEV` to the checkout under test:

```sh
bun run --cwd packages/drive drive check test/manual/tui-regressions/interaction-lifecycle.ts
bun run --cwd packages/drive drive start --name tui-interaction-lifecycle \
  --script test/manual/tui-regressions/interaction-lifecycle.ts \
  --dev "$OPENCODE_DEV"
```

The interaction probe asserts that:

- A submitted message is visible before a delayed model response begins.
- An active streaming response reaches the interrupted state after Escape.

The restart probe deliberately exposes a known failure:

```sh
bun run --cwd packages/drive drive check test/manual/tui-regressions/server-restart.ts
bun run --cwd packages/drive drive start --name tui-server-restart \
  --script test/manual/tui-regressions/server-restart.ts \
  --dev "$OPENCODE_DEV"
```

After the service restarts, the TUI reconnects its event stream but displays `Session not found` for the previous in-memory session. The failed run retains `after-restart.frame.json` in its artifact directory.
