# Symlink Template Policy

This repository uses symlinks to keep repeated package configuration and shared
test fixtures aligned across the pnpm workspace.

## Allowed Symlink Targets

Tracked symlinks may point to:

- Shared TypeScript configs under `config/`.
- Shared package templates under `templates/`.
- Shared local test fixtures under `scripts/` and `fixtures/`.
- Package-local shared fixture directories used by integration tests.

Symlinks must:

- Use relative targets.
- Resolve inside this repository.
- Resolve to an existing path.
- Avoid generated output directories such as `lib/`, `dist/`, `coverage/`, and
  docs build output.

## Removed Template Families

ESLint now uses root flat config via `eslint.config.cjs` and the shared config
package under `tools/eslint-config-base-web3`. Do not restore package-level
`.eslintrc*` or `.eslintignore` symlinks or templates.

## Enforcement

`pnpm run hygiene` enforces the symlink rules above. It fails on broken symlinks,
absolute symlink targets, symlinks that point outside the repository, links to
removed ESLint legacy templates, and links whose target resolves outside the
allowed locations: `config/`, `templates/`, `scripts/`, `fixtures/`, or a
package-local `test/` directory (`packages/<name>/test/`, `tools/<name>/test/`).
A target under generated output (`lib/`, `dist/`, `coverage/`, `.coverage/`,
`node_modules/`, `.turbo/`, `docs/build/`, `docs/.docusaurus/`) is rejected even
inside an allowed location. Every symlink is checked, including one named like a
directory the walk otherwise skips (`dist`, `node_modules`): `.gitignore`'s
`dist/` pattern does not match a symlink, so `git add` would track it.

When adding a package, prefer linking to the existing shared configs/templates
rather than copying them. If a package needs to diverge from a shared template,
document why in the package README or the pull request.

