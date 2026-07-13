import { join } from "node:path"
import { defineScript } from "../../src/index.js"

let setupGitError: string | undefined

export default defineScript({
  launch: "manual",
  async setup({ fs }) {
    setupGitError = await fs
      .writeFile(".GIT/config", "setup must not replace Git metadata\n")
      .then(() => undefined)
      .catch((error: unknown) => String(error))
  },
  async run({ artifacts, fs }) {
    const runGitError = await fs
      .writeFile(".GIT/config", "run must not replace Git metadata\n")
      .then(() => undefined)
      .catch((error: unknown) => String(error))
    await Bun.write(
      join(artifacts, "prepared-git-result.json"),
      `${JSON.stringify({ runGitError, setupGitError }, undefined, 2)}\n`,
    )
  },
})
