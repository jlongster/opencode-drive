import { lstat, mkdir, readlink, rm, rmdir, symlink } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))

export async function prepareScriptTooling(artifacts: string, script: string) {
  const file = resolve(script)
  if (!(await Bun.file(file).exists())) throw new Error(`script not found: ${file}`)
  const packageJson: unknown = await Bun.file(join(packageRoot, "package.json")).json()
  if (!isPackageMetadata(packageJson))
    throw new Error("opencode-drive package metadata is missing script dependencies")
  const dependencies = {
    "opencode-drive": `file:${packageRoot}`,
    "@typescript/native-preview":
      packageJson.devDependencies["@typescript/native-preview"],
    "@types/bun": packageJson.devDependencies["@types/bun"],
  }
  const manifest = join(artifacts, "package.json")
  const contents = `${JSON.stringify({ private: true, dependencies }, undefined, 2)}\n`
  if (!(await Bun.file(manifest).exists()) || (await Bun.file(manifest).text()) !== contents) {
    await Bun.write(manifest, contents)
  }
  const install = Bun.spawn([process.execPath, "install"], {
    cwd: artifacts,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const status = await install.exited
  if (status !== 0)
    throw new Error(
      `bun install failed in ${artifacts}: ${(await new Response(install.stderr).text()).trim()}`,
    )

  await Bun.write(
    join(artifacts, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          allowJs: true,
          checkJs: true,
          lib: ["ESNext"],
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "Bundler",
          skipLibCheck: true,
          types: ["bun"],
        },
        files: [file],
      },
      undefined,
      2,
    )}\n`,
  )
  return {
    file,
    tsgo: join(artifacts, "node_modules", ".bin", "tsgo"),
    tsconfig: join(artifacts, "tsconfig.json"),
    links: await linkScriptDependencies(file, artifacts),
  }
}

function isPackageMetadata(
  value: unknown,
): value is { readonly devDependencies: Record<string, string> } {
  if (typeof value !== "object" || value === null || !("devDependencies" in value))
    return false
  const dependencies = value.devDependencies
  return (
    typeof dependencies === "object" &&
    dependencies !== null &&
    "@typescript/native-preview" in dependencies &&
    typeof dependencies["@typescript/native-preview"] === "string" &&
    "@types/bun" in dependencies &&
    typeof dependencies["@types/bun"] === "string"
  )
}

export async function checkScript(artifacts: string, script: string) {
  const tooling = await prepareScriptTooling(artifacts, script)
  try {
    const child = Bun.spawn([tooling.tsgo, "-p", tooling.tsconfig], {
      cwd: artifacts,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    })
    const status = await child.exited
    if (status !== 0) throw new Error(`script type check failed with status ${status}`)
  } finally {
    await tooling.links.remove()
  }
}

async function linkScriptDependencies(script: string, artifacts: string) {
  const modules = join(dirname(script), "node_modules")
  const created: Array<{ readonly path: string; readonly target: string }> = []
  const directories: string[] = []
  const add = async (path: string, target: string) => {
    const existing = await lstat(path).catch(() => undefined)
    if (existing) {
      const previous = existing.isSymbolicLink()
        ? await readlink(path).catch(() => undefined)
        : undefined
      if (
        previous !== undefined &&
        /(?:^|[\\/])opencode-drive[\\/]run-/.test(previous) &&
        !(await Bun.file(previous).exists())
      ) {
        await rm(path, { force: true })
      } else {
        return
      }
    }
    const parent = dirname(path)
    if (!(await lstat(parent).catch(() => undefined))) {
      await mkdir(parent, { recursive: true })
      directories.push(parent)
    }
    await symlink(target, path)
    created.push({ path, target })
  }
  const remove = async () => {
    for (const link of created.reverse()) {
      const target = await readlink(link.path).catch(() => undefined)
      if (target === link.target) await rm(link.path, { force: true })
    }
    for (const path of directories.reverse())
      await rmdir(path).catch(() => undefined)
  }
  try {
    await add(
      join(modules, "opencode-drive"),
      join(artifacts, "node_modules", "opencode-drive"),
    )
    await add(
      join(modules, ".bin", "tsgo"),
      join(artifacts, "node_modules", ".bin", "tsgo"),
    )
    return { remove }
  } catch (error) {
    await remove()
    throw error
  }
}
