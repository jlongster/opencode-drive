## Protocol Convention

Keep CLI `--command.*` names and parameter shapes identical to the canonical OpenCode simulation protocol in `src/client/protocol.ts`. Do not add aliases or convenience methods; copy protocol updates from OpenCode and update the CLI directly.

After copying `packages/simulation/src/protocol/index.ts` from OpenCode into `src/client/protocol.ts`, manually update `src/client/protocol.types.ts` with the complete CLI command names, JSON parameter objects, and result types. `opencode-drive api` prints this plain TypeScript CLI contract.
