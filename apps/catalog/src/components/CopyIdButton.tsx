import { useState } from "react"

interface CopyIdButtonProps {
  readonly identifier: string
  readonly className?: string
}

export function CopyIdButton({ identifier, className = "" }: CopyIdButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle")

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(identifier)
      setStatus("copied")
    } catch {
      setStatus("failed")
    }
  }

  return (
    <button
      type="button"
      className={`copy-id-action ${className}`.trim()}
      title={identifier}
      aria-label={`Copy identifier ${identifier}`}
      onClick={copy}
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy ID"}
    </button>
  )
}
