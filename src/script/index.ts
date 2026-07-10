import type {
  AutomaticScriptDefinition,
  ManualScriptDefinition,
  ScriptDefinition,
} from "./types.js"

export function defineScript(script: ManualScriptDefinition): ManualScriptDefinition
export function defineScript(
  script: AutomaticScriptDefinition,
): AutomaticScriptDefinition
export function defineScript(script: ScriptDefinition): ScriptDefinition {
  return script
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export type * from "./types.js"
