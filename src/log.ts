import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

const prefix = "opencode-drive"
let currentLogFile = process.env.OPENCODE_DRIVE_LOG

export function driveLogFile(artifacts: string) {
  return join(artifacts, "logs", "opencode-drive.log")
}

export function configureLogFile(artifacts: string) {
  currentLogFile = driveLogFile(artifacts)
  process.env.OPENCODE_DRIVE_LOG = currentLogFile
  return currentLogFile
}

export function logSuccess(message: string) {
  const line = `${prefix}: ${message}`
  console.error(process.stderr.isTTY ? `\x1b[32m${line}\x1b[0m` : line)
  append("INFO", message)
}

export function logError(message: string) {
  const line = `error: ${message}`
  console.error(process.stderr.isTTY ? `\x1b[31m${line}\x1b[0m` : line)
  append("ERROR", message)
}

export function recordLog(level: "INFO" | "ERROR", message: string) {
  append(level, message)
}

function append(level: "INFO" | "ERROR", message: string) {
  if (!currentLogFile) return
  try {
    mkdirSync(dirname(currentLogFile), { recursive: true })
    appendFileSync(currentLogFile, `[${new Date().toISOString()}] ${level} ${message}\n`)
  } catch {
    // Logging must not change CLI behavior.
  }
}
