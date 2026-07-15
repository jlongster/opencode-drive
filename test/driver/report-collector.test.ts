import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { collect } from "../../src/driver/report-collector.js"
import { RunReport } from "../../src/driver/report.js"

const baseInput = (artifactRoot: string, artifactsRetained = true) => ({
  artifactRoot,
  artifactsRetained,
  timing: {
    startedAt: "2026-07-15T10:00:00.000Z",
    endedAt: "2026-07-15T10:00:01.250Z",
    durationMs: 1_250,
  },
  outcome: { _tag: "Succeeded" },
  compatibility: [{ _tag: "Legacy", role: "ui" }],
  screenshotPaths: [] as Array<string>,
  recordingPaths: [] as Array<string>,
})

const withArtifactRoot = <A, E>(
  use: (root: string) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "drive-report-"))),
    use,
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )

describe("report collector", () => {
  it.effect("discovers retained concrete logs and descriptors deterministically", () =>
    withArtifactRoot((root) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          Promise.all([
            mkdir(join(root, "logs", "opencode", "log"), { recursive: true }),
            mkdir(join(root, "drive"), { recursive: true }),
            mkdir(join(root, "home", ".local", "state", "opencode"), {
              recursive: true,
            }),
          ]),
        )
        yield* Effect.promise(() =>
          Promise.all([
            writeFile(join(root, "logs", "z.stderr.log"), "stderr"),
            writeFile(join(root, "logs", "a.stdout.log"), "stdout"),
            writeFile(join(root, "logs", "ignore.txt"), "ignored"),
            writeFile(join(root, "logs", "opencode", "log", "opencode.log"), "log"),
            writeFile(join(root, "drive", "client.json"), "{}"),
            writeFile(join(root, "drive", "ignore.txt"), "ignored"),
            writeFile(
              join(root, "home", ".local", "state", "opencode", "server.json"),
              "{}",
            ),
          ]),
        )

        const report = yield* collect(baseInput(root))

        expect(report.retention._tag).toBe("Retained")
        expect(report.logs).toEqual([
          { _tag: "Artifact", path: "logs/a.stdout.log" },
          { _tag: "Artifact", path: "logs/opencode/log/opencode.log" },
          { _tag: "Artifact", path: "logs/z.stderr.log" },
        ])
        expect(report.artifacts).toEqual([
          {
            name: "process descriptor: server.json",
            path: {
              _tag: "Artifact",
              path: "home/.local/state/opencode/server.json",
            },
            mediaType: "application/json",
          },
          {
            name: "launch descriptor: client.json",
            path: { _tag: "Artifact", path: "drive/client.json" },
            mediaType: "application/json",
          },
        ])
        expect(() => Schema.encodeSync(RunReport)(report)).not.toThrow()
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("reports a removed root without trying to discover it", () =>
    Effect.gen(function* () {
      const root = join(tmpdir(), "drive-report-removed-does-not-exist")
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }))

      const report = yield* collect(baseInput(root, false))

      expect(report.retention).toEqual({ _tag: "Removed", root })
      expect(report.logs).toEqual([])
      expect(report.artifacts).toEqual([])
    }).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("does not invent a log reference when the log directory is missing", () =>
    withArtifactRoot((root) =>
      Effect.gen(function* () {
        const report = yield* collect(baseInput(root))
        expect(report.logs).toEqual([])
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("excludes files whose canonical path escapes the artifact root", () =>
    withArtifactRoot((root) =>
      Effect.gen(function* () {
        const outside = yield* Effect.promise(() =>
          mkdtemp(join(tmpdir(), "drive-report-outside-")),
        )
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => rm(outside, { recursive: true, force: true })),
        )
        yield* Effect.promise(async () => {
          await mkdir(join(root, "logs"), { recursive: true })
          await writeFile(join(outside, "escaped.log"), "outside")
          await symlink(join(outside, "escaped.log"), join(root, "logs", "escaped.log"))
        })

        const report = yield* collect(baseInput(root))
        expect(report.logs).toEqual([])
      }),
    ).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.effect("keeps absolute screenshot and recording paths external", () =>
    withArtifactRoot((root) =>
      Effect.gen(function* () {
        const report = yield* collect({
          ...baseInput(root),
          screenshotPaths: [join(tmpdir(), "screenshots", "final.png")],
          recordingPaths: [join(tmpdir(), "recordings", "run.mp4")],
        })

        expect(report.screenshots).toEqual([
          { _tag: "External", path: join(tmpdir(), "screenshots", "final.png") },
        ])
        expect(report.recordings).toEqual([
          { _tag: "External", path: join(tmpdir(), "recordings", "run.mp4") },
        ])
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  )

  it.effect("rejects invalid artifact and media paths", () =>
    Effect.gen(function* () {
      const relativeRoot = yield* Effect.exit(collect(baseInput("relative/run")))
      const relativeMedia = yield* Effect.exit(
        collect({
          ...baseInput(join(tmpdir(), "unused"), false),
          screenshotPaths: ["screenshots/final.png"],
        }),
      )

      expect(Exit.isFailure(relativeRoot)).toBe(true)
      expect(Exit.isFailure(relativeMedia)).toBe(true)
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})
