import { join, resolve } from "node:path"
import * as Effect from "effect/Effect"
import { instanceError } from "./error.js"
import * as Process from "./process.js"

/**
 * Prepares an OpenCode development checkout for launch: verifies the CLI
 * entrypoint and `@opentui/solid` dependency, links a matching version into
 * the instance's artifact manifest, installs it, and returns the launch
 * command.
 */
export const prepareDev = Effect.fn("OpenCodeInstance.prepareDev")(function* (
  artifacts: string,
  directory: string,
) {
  const root = resolve(directory)
  const entrypoint = join(root, "packages", "cli", "src", "index.ts")
  const solidPackage = join(
    root,
    "packages",
    "tui",
    "node_modules",
    "@opentui",
    "solid",
    "package.json",
  )
  yield* Effect.tryPromise({
    try: async () => {
      if (!(await Bun.file(entrypoint).exists()))
        throw new Error(`OpenCode development entrypoint not found: ${entrypoint}`)
      if (!(await Bun.file(solidPackage).exists()))
        throw new Error(
          `OpenCode development dependency not found: ${solidPackage}; run bun install in ${root}`,
        )
      const value: unknown = await Bun.file(solidPackage).json()
      if (!isPackageInfo(value))
        throw new Error(`Invalid @opentui/solid package metadata: ${solidPackage}`)
      const manifestPath = join(artifacts, "package.json")
      const manifest: unknown = await Bun.file(manifestPath)
        .json()
        .catch(() => ({}))
      const existing = isDependencyManifest(manifest) ? manifest : {}
      await Bun.write(
        manifestPath,
        `${JSON.stringify(
          {
            ...existing,
            private: true,
            dependencies: {
              ...existing.dependencies,
              "@opentui/solid": value.version,
            },
          },
          undefined,
          2,
        )}\n`,
      )
      return value
    },
    catch: (cause) => instanceError("prepare development checkout", cause),
  })
  const installed = yield* Process.run([process.execPath, "install"], {
    cwd: artifacts,
    stdout: "ignore",
    stderr: "ignore",
  }).pipe(Effect.mapError((cause) => instanceError("install development dependencies", cause)))
  if (installed.status !== 0)
    return yield* Effect.fail(
      instanceError("install development dependencies", `bun install failed with status ${installed.status}`),
    )
  return [
    process.execPath,
    "--conditions=browser",
    "--preload=@opentui/solid/preload",
    entrypoint,
  ]
})

function isPackageInfo(value: unknown): value is { readonly version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string"
  )
}

function isDependencyManifest(
  value: unknown,
): value is { readonly dependencies?: Readonly<Record<string, string>> } {
  if (typeof value !== "object" || value === null) return false
  if (!("dependencies" in value) || value.dependencies === undefined) return true
  return typeof value.dependencies === "object" && value.dependencies !== null
}
