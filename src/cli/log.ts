export function logSuccess(message: string) {
  const line = `opencode-drive: ${message}`
  console.error(process.stderr.isTTY ? `\x1b[32m${line}\x1b[0m` : line)
}
