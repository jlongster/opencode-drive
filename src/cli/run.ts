import { resolve } from "node:path"
import { executeCommands } from "./commands.js"
import { runCampaign } from "./campaign.js"
import { runDriver } from "./driver.js"
import { launchInstance } from "./instance.js"
import type { RunOptions } from "./types.js"

export async function run(options: RunOptions) {
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
  console.error(`opencode-drive: connect with opencode-drive connect --name ${instance.manifest.name}`)
  const interrupt = () => void instance.stop()
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  try {
    if (options.commands.length > 0) {
      await instance.waitForDrive("both")
      const result = await executeCommands(instance.manifest, options.commands)
      await instance.stop()
      console.log(JSON.stringify(result, undefined, 2))
      return
    }
    if (options.driver) {
      await instance.waitForDrive("both")
      await runDriver(resolve(options.driver), instance.manifest)
      return
    }
    const status = await instance.child.exited
    if (status !== 0) process.exitCode = status
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", interrupt)
    await instance.stop()
  }
}
