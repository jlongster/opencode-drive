import * as Schema from "effect/Schema"

const absolutePathCheck = Schema.makeFilter<string>(
  (path) => isAbsolutePath(path),
  { expected: "an absolute POSIX or Windows path without NUL bytes" },
)

const relativePathCheck = Schema.makeFilter<string>(
  (path) => isRelativePath(path),
  {
    expected:
      "a portable relative path using non-empty '/'-separated segments without '.' or '..'",
  },
)

/** A fully rooted POSIX or Windows filesystem path. */
export const AbsolutePath = Schema.String.check(absolutePathCheck).pipe(
  Schema.brand("OpenCodeDrive.AbsolutePath"),
)
export type AbsolutePath = typeof AbsolutePath.Type

/** A portable path relative to an OpenCode Drive artifact directory. */
export const RelativePath = Schema.String.check(relativePathCheck).pipe(
  Schema.brand("OpenCodeDrive.RelativePath"),
)
export type RelativePath = typeof RelativePath.Type

/** A report path resolved either against its artifact root or independently. */
export const ReportPath = Schema.TaggedUnion({
  Artifact: { path: RelativePath },
  External: { path: AbsolutePath },
})
export type ReportPath = typeof ReportPath.Type

export const RunOutcome = Schema.TaggedUnion({
  Succeeded: {},
  Failed: { message: Schema.NonEmptyString },
  Interrupted: { message: Schema.optionalKey(Schema.NonEmptyString) },
})
export type RunOutcome = typeof RunOutcome.Type

export const Compatibility = Schema.TaggedUnion({
  Negotiated: {
    role: Schema.Literals(["ui", "backend"]),
    protocolVersion: Schema.NonEmptyString,
    openCodeVersion: Schema.NonEmptyString,
    capabilities: Schema.Array(Schema.NonEmptyString),
  },
  Legacy: {
    role: Schema.Literals(["ui", "backend"]),
    openCodeVersion: Schema.optionalKey(Schema.NonEmptyString),
  },
})
export type Compatibility = typeof Compatibility.Type

export const ArtifactRetention = Schema.TaggedUnion({
  Retained: { root: AbsolutePath },
  Removed: { root: AbsolutePath },
})
export type ArtifactRetention = typeof ArtifactRetention.Type

export const RunTiming = Schema.Struct({
  startedAt: Schema.DateTimeUtcFromString,
  endedAt: Schema.DateTimeUtcFromString,
  durationMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
})
export interface RunTiming extends Schema.Schema.Type<typeof RunTiming> {}

export const ReportArtifact = Schema.Struct({
  name: Schema.NonEmptyString,
  path: ReportPath,
  mediaType: Schema.optionalKey(Schema.NonEmptyString),
})
export interface ReportArtifact
  extends Schema.Schema.Type<typeof ReportArtifact> {}

/** The version 1 JSON-serializable evidence contract for one Drive run. */
export const RunReport = Schema.Struct({
  version: Schema.Literal(1),
  timing: RunTiming,
  outcome: RunOutcome,
  compatibility: Schema.Array(Compatibility),
  retention: ArtifactRetention,
  logs: Schema.Array(ReportPath),
  screenshots: Schema.Array(ReportPath),
  recordings: Schema.Array(ReportPath),
  artifacts: Schema.Array(ReportArtifact),
})
export interface RunReport extends Schema.Schema.Type<typeof RunReport> {}

export const decodeAbsolutePath = Schema.decodeUnknownEffect(AbsolutePath)
export const decodeRelativePath = Schema.decodeUnknownEffect(RelativePath)
export const decodeRunReport = Schema.decodeUnknownEffect(RunReport)

function isAbsolutePath(path: string): boolean {
  if (path.length === 0 || path.includes("\0")) return false
  if (path.startsWith("/")) return true
  if (/^[A-Za-z]:[\\/]/.test(path)) return true
  if (/^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path)) return true
  return /^\\\\[?.]\\(?:[A-Za-z]:\\|UNC\\[^\\]+\\[^\\]+(?:\\|$))/.test(
    path,
  )
}

function isRelativePath(path: string): boolean {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path)
  )
    return false

  return path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}
