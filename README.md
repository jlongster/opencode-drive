# opencode-drive

Drive visible, headless, simulated, or real OpenCode instances.

# Skill

Install the skill for agents to use it:

```sh
npx skills add jlongster/opencode-drive --agent opencode --skill opencode-drive
```

# Usage

**Start the default detached, headless instance:**

```bash
bunx opencode-drive start
```

**Start a named instance, then address it with `--name`:**

```bash
bunx opencode-drive start --name demo
```

**Type, submit a prompt, and take a screenshot:**

```bash
bunx opencode-drive send --name demo \
  --command.type "Explain this project in one sentence" \
  --command.enter \
  --command.screenshot
```

**List the full command API for agents:**

```bash
bunx opencode-drive api
```

**Run OpenCode visibly in the foreground:**

```bash
bunx opencode-drive start --visible
```

**Run a local OpenCode development checkout:**

```bash
cd ~/projects/opencode
bunx opencode-drive start --visible --dev .
```

**Run a custom OpenCode command after `--`:**

```bash
bunx opencode-drive start --name demo -- opencode2 --standalone
```

**Stop a detached headless instance:**

```bash
bunx opencode-drive stop --name demo
```

# Use cases

There are two different modes OpenCode can run in:

* Simulated: core layers like networking are swapped out in the backend so you can control them
* Driven: starts websocket servers internally to expose commands to drive the app

You can choose one or the other, or both! This allows the following use cases:

## You want to develop opencode

You are running a development version of OpenCode to work on it. You have another OpenCode instance making changes to the app.

In this case, you don't care about simulation. But you still want OpenCode to see and drive your development version! This _closes the loop_ and gives direct feedback to AI.

To do this, all you have to do is pass `OPENCODE_DRIVE=1` when running opencode:

```sh
# In the opencode repo
OPENCODE_DRIVE=1 bun run dev
```

#### UI work in simulated mode

If you are doing UI work, you may want to run it in simulated mode. You can do that with this:

```
bunx opencode-drive start --dev . --visible
```

The nice thing about this is OpenCode can drive it into the states you are interested in. Additionally, its able to restart the UI itself. The server will still be running in the background so this only restarts the UI:

```sh
bunx opencode-drive restart
```

## You want opencode to develop itself

OpenCode can spawn it's own instances of OpenCode in headless mode. Use the skill in this repo to teach it about it.

It will spawn it in both drive and simulated mode, allowing it explore the app. It will use the `screenshot` command to capture screenshots to see what's happening, providing a full feedback loop.

## You want to share reproducible steps

Ask opencode to find a bug, and list the commands it used to get there. You can then share this list with someone else who can use `opencode-drive` in visible mode to visually inspect it and develop a fix. (Or just share the steps with your own local OpenCode to find a fix)

## You want to run it a billion times and assert properties

This isn't fully implemented right now, but in the future `opencode-drive` will provide a way to specify properties that you want to assert, and run the app a billion times in many different states to make sure those properties hold. This will work with a new CLI command that takes different flags.
