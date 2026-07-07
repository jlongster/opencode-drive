export interface DriveCommand {
  readonly operation: string
  readonly value?: string
}

export interface StartOptions {
  readonly kind: "start"
  readonly script?: string
  readonly visible: boolean
  readonly dev?: string
  readonly state?: string
  readonly command: ReadonlyArray<string>
}

export interface SendOptions {
  readonly kind: "send"
  readonly commands: ReadonlyArray<DriveCommand>
}

export type CliOptions = StartOptions | SendOptions
