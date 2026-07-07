## Protocol Convention

Keep CLI `--command.ui.*` names and parameter shapes identical to the frontend portion of the canonical OpenCode simulation protocol in `src/client/protocol.ts`. Backend LLM control belongs in scripts, not CLI commands. Do not add aliases or convenience methods; copy protocol updates from OpenCode and update the CLI directly.

After copying `packages/simulation/src/protocol/index.ts` from OpenCode into `src/client/protocol.ts`, manually update `src/client/protocol.types.ts` with the complete CLI command names, JSON parameter objects, and result types. `opencode-drive api` prints this plain TypeScript CLI contract.
