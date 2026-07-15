import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import {
  AbsolutePath,
  ArtifactRetention,
  Compatibility,
  RelativePath,
  ReportPath,
  RunOutcome,
  RunReport,
} from "../../src/driver/report.js"

const decodeAbsolutePath = Schema.decodeUnknownSync(AbsolutePath)
const decodeRelativePath = Schema.decodeUnknownSync(RelativePath)
const decodeReportPath = Schema.decodeUnknownSync(ReportPath)
const decodeRunReport = Schema.decodeUnknownSync(RunReport)

describe("report paths", () => {
  it("accepts fully rooted POSIX and Windows absolute paths", () => {
    for (const path of [
      "/",
      "/tmp/opencode drive/run",
      "C:\\Users\\kit\\run",
      "d:/work/run",
      "\\\\server\\share\\run",
      "\\\\?\\C:\\very-long\\run",
      "\\\\?\\UNC\\server\\share\\run",
    ]) {
      expect(decodeAbsolutePath(path)).toBe(path)
    }
  })

  it("rejects relative, drive-relative, root-relative, empty, and NUL paths", () => {
    for (const path of [
      "",
      ".",
      "tmp/run",
      "C:run",
      "\\run",
      "path\0with-null",
    ]) {
      expect(() => decodeAbsolutePath(path), path).toThrow()
    }
    expect(() => decodeAbsolutePath(null)).toThrow()
  })

  it("accepts portable artifact-relative paths", () => {
    for (const path of [
      "logs/opencode-drive.log",
      "screenshots/home.png",
      "recording.mp4",
      "directory.with.dots/file",
    ]) {
      expect(decodeRelativePath(path)).toBe(path)
    }
  })

  it("rejects absolute, Windows-separated, traversal, empty-segment, and NUL variants", () => {
    for (const path of [
      "",
      "/logs/run.log",
      "C:/logs/run.log",
      "logs\\run.log",
      ".",
      "..",
      "./logs/run.log",
      "logs/../run.log",
      "logs/./run.log",
      "logs//run.log",
      "logs/",
      "logs/run\0.log",
    ]) {
      expect(() => decodeRelativePath(path), path).toThrow()
    }
    expect(() => decodeRelativePath(null)).toThrow()
  })

  it("validates tagged artifact-relative and external report paths", () => {
    expect(
      decodeReportPath({ _tag: "Artifact", path: "logs/drive.log" }),
    ).toEqual({ _tag: "Artifact", path: "logs/drive.log" })
    expect(
      decodeReportPath({ _tag: "External", path: "C:\\exports\\run.mp4" }),
    ).toEqual({ _tag: "External", path: "C:\\exports\\run.mp4" })

    expect(() =>
      decodeReportPath({ _tag: "Artifact", path: "../drive.log" }),
    ).toThrow()
    expect(() =>
      decodeReportPath({ _tag: "External", path: "exports/run.mp4" }),
    ).toThrow()
    expect(() => decodeReportPath(null)).toThrow()
  })
})

describe("RunReport", () => {
  const encoded = {
    version: 1 as const,
    timing: {
      startedAt: "2026-07-15T10:00:00.000Z",
      endedAt: "2026-07-15T10:00:01.250Z",
      durationMs: 1_250,
    },
    outcome: { _tag: "Succeeded" as const },
    compatibility: [
      {
        _tag: "Negotiated" as const,
        role: "ui" as const,
        protocolVersion: 1,
        opencodeVersion: "2.0.0",
        capabilities: ["ui.capture"],
      },
      { _tag: "Legacy" as const, role: "backend" as const },
    ],
    retention: {
      _tag: "Retained" as const,
      root: "/tmp/opencode-drive/run-123",
    },
    logs: [{ _tag: "Artifact" as const, path: "logs/drive.log" }],
    screenshots: [
      { _tag: "Artifact" as const, path: "screenshots/final.png" },
    ],
    recordings: [
      { _tag: "External" as const, path: "C:\\exports\\run.mp4" },
    ],
    artifacts: [
      {
        name: "backend events",
        path: {
          _tag: "Artifact" as const,
          path: "backend-events.jsonl",
        },
        mediaType: "application/x-ndjson",
      },
    ],
  }

  it("decodes and re-encodes the versioned JSON contract", () => {
    const report = decodeRunReport(encoded)

    expect(DateTime.formatIso(report.timing.startedAt)).toBe(
      "2026-07-15T10:00:00.000Z",
    )
    expect(report.outcome).toEqual(RunOutcome.cases.Succeeded.make({}))
    expect(report.compatibility[0]).toEqual(
      Compatibility.cases.Negotiated.make({
        role: "ui",
        protocolVersion: 1,
        opencodeVersion: "2.0.0",
        capabilities: ["ui.capture"],
      }),
    )
    expect(report.retention).toEqual(
      ArtifactRetention.cases.Retained.make({
        root: AbsolutePath.make("/tmp/opencode-drive/run-123"),
      }),
    )
    expect(Schema.encodeSync(RunReport)(report)).toEqual(encoded)
  })

  it("rejects unsupported versions and invalid nested values", () => {
    expect(() => decodeRunReport({ ...encoded, version: 2 })).toThrow()
    expect(() =>
      decodeRunReport({
        ...encoded,
        timing: { ...encoded.timing, durationMs: -1 },
      }),
    ).toThrow()
    expect(() =>
      decodeRunReport({
        ...encoded,
        logs: [{ _tag: "Artifact", path: "../outside.log" }],
      }),
    ).toThrow()
    expect(() => decodeRunReport({ ...encoded, recordings: [null] })).toThrow()
  })
})
