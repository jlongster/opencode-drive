---
"opencode-drive": minor
---

Unify the Effect driver and `defineScript` around one canonical programmatic model. Both expose the generated SDK as `opencode`, the primary frontend as `tui`, additional frontends through `tuis`, and the primary UI as `ui`. Every `Tui` has the same `{ ui, close, recording }` shape and `{ recording, viewport }` options. Project setup now uses the shared `Project`, `Setup`, `SetupContext`, and `ProjectFileSystem` types. Remove duplicate script UI types, flattened frontend handles, partial settlement controls, root-level raw simulation exports, convenience CLI aliases, and the `wait` helper.
