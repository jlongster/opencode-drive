import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import {
  AbsolutePath,
  ArtifactRetention,
  Compatibility,
  ReportArtifact,
  ReportPath,
  RunOutcome,
  RunReport,
  RunTiming,
} from "./report.js"

export const Input = Schema.Struct({
  artifactRoot: AbsolutePath,
  artifactsRetained: Schema.Boolean,
  timing: RunTiming,
  outcome: RunOutcome,
  compatibility: Schema.Array(Compatibility),
  screenshotPaths: Schema.Array(AbsolutePath),
  recordingPaths: Schema.Array(AbsolutePath),
})
export interface Input extends Schema.Schema.Type<typeof Input> {}

export class Error extends Schema.TaggedErrorClass<Error>()(
  "OpenCodeDrive.ReportCollectorError",
  {
    operation: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
  },
) {}

const processDescriptors = [
  "home/.local/state/opencode/server.json",
  "home/.local/state/opencode/service-local.json",
  "home/.local/state/opencode/service.json",
] as const

/** Collect the concrete evidence that exists when a Drive run settles. */
export const collect = Effect.fn("RunReportCollector.collect")(function* (
  input: unknown,
) {
  const decoded = yield* Schema.decodeUnknownEffect(Input)(input).pipe(
    Effect.mapError((cause) => collectorError("validate input", cause)),
  )
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem

  if (!path.isAbsolute(decoded.artifactRoot))
    return yield* Effect.fail(
      collectorError(
        "validate input",
        `artifact root is not absolute on this host: ${decoded.artifactRoot}`,
      ),
    )

  const root = path.resolve(decoded.artifactRoot)
  const brandedRoot = yield* AbsolutePath.makeEffect(root).pipe(
    Effect.mapError((cause) => collectorError("validate artifact root", cause)),
  )
  const retention = decoded.artifactsRetained
    ? ArtifactRetention.cases.Retained.make({ root: brandedRoot })
    : ArtifactRetention.cases.Removed.make({ root: brandedRoot })

  let logs: ReadonlyArray<ReportPath> = []
  let artifacts: ReadonlyArray<ReportArtifact> = []

  if (decoded.artifactsRetained) {
    const canonicalRoot = yield* fs.realPath(root).pipe(
      Effect.mapError((cause) => collectorError("resolve artifact root", cause)),
    )
    const logPaths = yield* discoverDirectory(
      fs,
      path,
      root,
      canonicalRoot,
      "logs",
      (relative) => relative.endsWith(".log"),
    )
    logs = logPaths.map((relative) =>
      ReportPath.cases.Artifact.make({ path: relative }),
    )

    const launchDescriptors = yield* discoverDirectory(
      fs,
      path,
      root,
      canonicalRoot,
      "drive",
      (relative) => relative.endsWith(".json"),
    )
    const retainedProcessDescriptors = yield* Effect.forEach(
      processDescriptors,
      (relative) => concreteRelativePath(fs, path, root, canonicalRoot, relative),
    ).pipe(Effect.map((paths) => paths.filter((value) => value !== undefined)))

    artifacts = [
      ...retainedProcessDescriptors.map((relative) =>
        ReportArtifact.make({
          name: `process descriptor: ${path.basename(relative)}`,
          path: ReportPath.cases.Artifact.make({ path: relative }),
          mediaType: "application/json",
        }),
      ),
      ...launchDescriptors.map((relative) =>
        ReportArtifact.make({
          name: `launch descriptor: ${path.basename(relative)}`,
          path: ReportPath.cases.Artifact.make({ path: relative }),
          mediaType: "application/json",
        }),
      ),
    ]
  }

  return yield* RunReport.makeEffect({
    version: 1,
    timing: decoded.timing,
    outcome: decoded.outcome,
    compatibility: decoded.compatibility,
    retention,
    logs,
    screenshots: decoded.screenshotPaths.map((mediaPath) =>
      ReportPath.cases.External.make({ path: mediaPath }),
    ),
    recordings: decoded.recordingPaths.map((mediaPath) =>
      ReportPath.cases.External.make({ path: mediaPath }),
    ),
    artifacts,
  }).pipe(
    Effect.mapError((cause) => collectorError("validate report", cause)),
  )
})

function discoverDirectory(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  canonicalRoot: string,
  directory: string,
  include: (relative: string) => boolean,
) {
  const absoluteDirectory = path.join(root, directory)
  return Effect.gen(function* () {
    if (!(yield* fs.exists(absoluteDirectory))) return []

    const entries = yield* fs.readDirectory(absoluteDirectory, { recursive: true }).pipe(
      Effect.mapError((cause) => collectorError(`read ${directory}`, cause)),
    )
    const candidates = entries
      .map((entry) => path.join(directory, entry))
      .filter(include)
      .sort()

    return (yield* Effect.forEach(candidates, (relative) =>
      concreteRelativePath(fs, path, root, canonicalRoot, relative),
    )).filter((value) => value !== undefined)
  })
}

function concreteRelativePath(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  canonicalRoot: string,
  relative: string,
) {
  const candidate = path.resolve(root, relative)
  if (!isContained(path, root, candidate))
    return Effect.succeed(undefined)

  return Effect.gen(function* () {
    if (!(yield* fs.exists(candidate))) return undefined
    const info = yield* fs.stat(candidate).pipe(
      Effect.mapError((cause) => collectorError("inspect artifact", cause)),
    )
    if (info.type !== "File") return undefined

    const canonicalCandidate = yield* fs.realPath(candidate).pipe(
      Effect.mapError((cause) => collectorError("resolve artifact", cause)),
    )
    if (!isContained(path, canonicalRoot, canonicalCandidate)) return undefined

    const portable = path.relative(root, candidate).split(path.sep).join("/")
    return yield* Schema.decodeUnknownEffect(ReportPath.cases.Artifact.fields.path)(
      portable,
    ).pipe(Effect.orElseSucceed(() => undefined))
  })
}

function isContained(path: Path.Path, root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function collectorError(operation: string, cause: unknown) {
  return new Error({
    operation,
    message: cause instanceof globalThis.Error ? cause.message : String(cause),
  })
}

export * as ReportCollector from "./report-collector.js"
