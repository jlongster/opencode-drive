import { resolve } from "node:path"
import { executeCommands } from "./commands.js"
import { runCampaign } from "../experimental/cli-campaign.js"
import { runDriver } from "./driver.js"
import { launchInstance } from "./instance.js"
import type { StartOptions } from "./types.js"
import { join } from "node:path"

export async function start(options: StartOptions) {
  if (options.campaign) return runCampaign(options)
  const instance = await launchInstance({
    name: options.name,
    command: options.command,
    dev: options.dev,
    state: options.state,
    visible: options.visible,
  })
  console.error(`opencode-drive: ${instance.manifest.name}`)
  console.error(`opencode-drive: artifacts ${instance.manifest.artifacts}`)
  console.error(`opencode-drive: send commands with opencode-drive send --name ${instance.manifest.name}`)
  if (options.detach) {
    await instance.waitForDrive("both")
    await instance.detach()
    return
  }
  const interrupt = () => void instance.stop()
  const stopRestart = options.visible ? watchVisibleRestarts(instance) : () => {}
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  try {
    if (options.commands.length > 0) {
      await instance.waitForDrive("both")
      const result = await executeCommands(instance.manifest, options.commands)
      await instance.stop()
      if (options.commands.length === 1 && ["ui.screenshot", "ui.end-record"].includes(options.commands[0]?.operation ?? "")) {
        console.log(result.results[0]?.result)
        return
      }
      if (options.commands.length === 1 && ["llm.pending", "ui.state", "ui.start-record"].includes(options.commands[0]?.operation ?? "")) {
        console.log(JSON.stringify(result.results[0]?.result, undefined, 2))
        return
      }
      console.log("success")
      return
    }
    if (options.driver) {
      await instance.waitForDrive("both")
      await runDriver(resolve(options.driver), instance.manifest)
      return
    }
    const status = await instance.wait()
    if (status !== 0) process.exitCode = status
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    stopRestart()
    await instance.stop()
  }
}

function watchVisibleRestarts(instance: Awaited<ReturnType<typeof launchInstance>>) {
  const request = join(instance.manifest.artifacts, "restart-request.json")
  const response = join(instance.manifest.artifacts, "restart-response.json")
  const state = { token: undefined as string | undefined, busy: false }
  const timer = setInterval(() => {
    if (state.busy) return
    state.busy = true
    void handleVisibleRestart(instance, request, response, state).finally(() => {
      state.busy = false
    })
  }, 50)
  return () => clearInterval(timer)
}

async function handleVisibleRestart(
  instance: Awaited<ReturnType<typeof launchInstance>>,
  request: string,
  response: string,
  state: { token: string | undefined },
) {
  const value: unknown = await Bun.file(request).json().catch(() => undefined)
  if (!isRestartRequest(value) || value.token === state.token) return
  state.token = value.token
  try {
    await instance.restart()
    await Bun.write(response, `${JSON.stringify({ token: value.token, success: true })}\n`)
  } catch (error) {
    await Bun.write(response, `${JSON.stringify({
      token: value.token,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })}\n`)
  }
}

function isRestartRequest(value: unknown): value is { readonly token: string } {
  return typeof value === "object" && value !== null && "token" in value && typeof value.token === "string"
}
