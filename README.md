# opencode-probe

## Generated Flow Campaigns

Generate and run ten reproducible, state-valid multi-turn flows through a fresh
simulated opencode instance per flow:

```bash
bun run campaign --count 10 --seed 42000 --turns 7
```

Watch the generated turns in the real terminal renderer, pausing 750ms between
turns:

```bash
bun run campaign --count 10 --seed 42000 --turns 7 --renderer visible --chunk-delay 30
```

The default has no delay between turns. `--chunk-delay 30` leaves 30ms between
provider chunks so streaming remains visible without slowing the campaign down.
Race paths include duplicate submission, steering during a stream, interruption,
tool-call continuation boundaries, and invalid provider termination. The latter
waits for the backend exchange to disappear, sends double Escape, and fails if
the TUI still presents the session as running.

Flow properties live in `src/flows/properties.ts`. Add a `defineProperty(...)`
entry to assert state after submission or after a terminal outcome. Built-ins
assert that submission visibly enters running state, every turn reaches a
terminal outcome with no provider exchange left, and the TUI no longer presents
the turn as running afterward.

Artifacts are written to `/tmp/opencode-probe-campaign`. Each flow stores its
generated `scenario.json`, isolated state, simulation and driver logs, final
screen, and result. `summary.json` aggregates the campaign. Re-run one exact
flow by using the same seed with `--count 1`.

The generator covers plain and chunked text, reasoning, markdown, and valid
read-only tool-call/follow-up rounds. It advances from enabled states only:
the prompt editor must be ready, every expected assistant exchange must finish,
every tool call must receive a continuation, and all model exchanges must drain
before the flow passes.

## Prepare State

```bash
STATE=/tmp/opencode-sim-state
rm -rf "$STATE"
mkdir -p "$STATE/project/.config/opencode" "$STATE/project/src"

cat > "$STATE/project/opencode.json" <<'JSON'
{
  "model": "simulation/sim-model",
  "providers": {
    "simulation": {
      "name": "Simulation",
      "request": { "body": { "apiKey": "sim-key" } },
      "models": {
        "sim-model": {
          "name": "Simulated Model",
          "api": { "type": "aisdk", "package": "@ai-sdk/openai-compatible", "url": "https://api.openai.com/v1" },
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 128000, "output": 16000 }
        }
      }
    }
  }
}
JSON

cp "$STATE/project/opencode.json" "$STATE/project/.config/opencode/opencode.json"

cat > "$STATE/project/src/example.ts" <<'EOF'
export function greet(name: string) {
  return `hello ${name}`
}
EOF
```

## Run Directly

Fake renderer:

```bash
./bin/opencode-sim \
  --renderer fake \
  --driver 'bun /root/projects/opencode-probe/src/driver.ts "Read src/example.ts"' \
  -- \
  bun run --conditions=browser --preload=@opentui/solid/preload \
    /root/projects/opencode-latest/packages/cli/src/index.ts \
    --standalone
```

Visible renderer:

```bash
./bin/opencode-sim \
  --renderer visible \
  --driver 'bun /root/projects/opencode-probe/src/driver.ts "Read src/example.ts"' \
  -- \
  bun run --conditions=browser --preload=@opentui/solid/preload \
    /root/projects/opencode-latest/packages/cli/src/index.ts \
    --standalone
```

Logs:

```bash
tail -f /tmp/opencode-simulation.log
cat /tmp/opencode-simulation-driver.log
```

## Run With Terminal Control

Start the visible simulation in a Terminal Control session:

```bash
termctrl start opencode-sim-visible --host opentui --cols 112 --rows 34 -- \
  /root/projects/opencode-probe/bin/opencode-sim \
    --renderer visible \
    --driver 'bun /root/projects/opencode-probe/src/driver.ts "Read src/example.ts"' \
    -- \
    bun run --conditions=browser --preload=@opentui/solid/preload \
      /root/projects/opencode-latest/packages/cli/src/index.ts \
      --standalone
```

Show the session:

```bash
termctrl show opencode-sim-visible
```

Save a screenshot:

```bash
termctrl save opencode-sim-visible --format png --out /tmp/opencode-sim-visible.png
```

Capture frames for a video:

```bash
for i in {1..60}; do
  termctrl save opencode-sim-visible --format png --out "/tmp/opencode-sim-$i.png"
  sleep 0.1
done
ffmpeg -framerate 10 -i /tmp/opencode-sim-%d.png -pix_fmt yuv420p /tmp/opencode-sim.mp4
```

Stop the session:

```bash
termctrl stop opencode-sim-visible
```
