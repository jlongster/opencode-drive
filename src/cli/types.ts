export interface InstanceManifest {
  readonly version: 1
  readonly name: string
  readonly pid: number
  readonly startedAt: string
  readonly mode: "simulated" | "real"
  readonly cwd: string
  readonly artifacts: string
  readonly endpoints: {
    readonly ui: string
    readonly backend: string
  }
}

export interface DriveCommand {
  readonly operation: string
  readonly value?: string
}

export interface CommonOptions {
  readonly name?: string
  readonly driver?: string
  readonly commands: ReadonlyArray<DriveCommand>
}

export interface RunOptions extends CommonOptions {
  readonly kind: "run"
  readonly campaign?: string
  readonly seed: number
  readonly caseIndex?: number
  readonly count?: number
  readonly concurrency: number
  readonly visible: boolean
  readonly dev?: string
  readonly state?: string
  readonly anchor?: string
  readonly command: ReadonlyArray<string>
}

export interface ConnectOptions extends CommonOptions {
  readonly kind: "connect"
}

export type CliOptions = RunOptions | ConnectOptions
