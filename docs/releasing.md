# Releasing

This repository contains one public npm package and uses Changesets for versioning and publishing. Use Bun for installation, validation, and package scripts.

## Release 0.5.0

The manifest is already versioned at `0.5.0`, while npm's `latest` version is `0.4.0`. All work currently in the repository belongs to `0.5.0`, so there is intentionally no pending changeset for it. Adding one and running `bun run release:version` would describe work after `0.5.0` and bump the manifest to at least `0.5.1`.

To publish the current release candidate:

1. Confirm `bun pm view opencode-drive version` still reports `0.4.0`.
2. Run `bun install --frozen-lockfile`.
3. Run `bun run release:validate` and inspect the dry-run package file list and metadata.
4. Run `bun run release`. This validates again, then `changeset publish` detects that local `0.5.0` is absent from npm, publishes it with public access, and creates the corresponding Git tag.
5. Push the release commit and tag after verifying npm.

Do not run `bun run release:version` for this initial Changesets-managed release.

## Future Releases

1. Run `bun run changeset` for each user-facing change and commit the generated `.changeset/*.md` file with that change.
2. When releasing, run `bun run release:version`. This consumes pending changesets, updates `package.json` and `CHANGELOG.md`, and selects the next version relative to the current manifest version.
3. Run `bun install`, then `bun run release:validate` and inspect the dry-run package contents.
4. Commit the version, changelog, and lockfile updates.
5. Run `bun run release` from that commit. Do not publish with `npm publish` directly.
