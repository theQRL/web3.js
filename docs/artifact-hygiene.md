# Artifact Hygiene

This repository keeps generated package output and local accidental files out of
tracked source. CI builds the packages before packing or publishing, so generated
`lib/`, `dist/`, coverage, and temporary dependency-manager artefacts should not
be committed.

## Removed From Tracked Scope

The current cleanup removes these committed artefacts from the tracked working
tree:

- Root and docs `yarn.lock` files.
- Black-box test `.yarnrc` and `yarn.lock` files.
- The accidental copied fixture `packages/web3/test/fixtures/transactions copy.json`.

Local build outputs may still exist after validation commands, but they are
ignored and must remain untracked.

## Enforcement

`pnpm run hygiene` (`scripts/check-repo-hygiene.js`, also the `pre-commit`
hook) rejects:

- Tracked Yarn artefacts, generated package output under `packages/*` and
  `tools/*` (`lib/`, `dist/`), coverage output (`coverage/`, `.coverage/`),
  local secret files (`.secrets.json`, `.env`, `.env.*`), and copied-file
  artefacts.
- A local secret file anywhere in the tree that `.gitignore` does not cover.
  An untracked, ignored `.secrets.json` (written by `pnpm run init:secrets`,
  read by the e2e suites) is the expected developer state and passes; it is
  never deleted by `pnpm run clean`.
- `.yarnrc`, `yarn.lock`, and `* copy.*` files anywhere outside ignored
  dependency directories.
- Symlinks that are broken, absolute, point outside the repository, point at a
  removed ESLint legacy template, or resolve outside the allowed targets of
  [`docs/symlink-template-policy.md`](symlink-template-policy.md). Symlinks
  are checked before any name-based exclusion, so a link named `dist` or
  `node_modules` is not skipped; only real directories with those names are.

The release inspection (`pnpm run release:inspect-packages`) applies the
secret and dependency-manager rules to the npm pack output at any depth.

Before audit handoff or release packing, run `pnpm run clean` to remove ignored
build/test output (it keeps `node_modules` and `.secrets.json`), then rerun
`pnpm run hygiene`.
