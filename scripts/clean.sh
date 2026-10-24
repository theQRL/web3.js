#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Generated output only. `.secrets.json` is developer-owned state (written by
# `pnpm run init:secrets`, read by the e2e suites) and is never removed here;
# it is gitignored and `pnpm run hygiene` fails only if it is tracked.
paths=(
	"tmp"
	".coverage"
	".nyc_output"
	"lib"
	"dist"
	"docs/.docusaurus"
	"docs/api"
	"docs/build"
	"docs/docs/api"
)

for path in "${paths[@]}"; do
	rm -rf "$path"
done

# Prune node_modules first: a package-local dependency may legitimately ship a
# lib/ or dist/ directory of its own, and it is not ours to delete.
find packages tools -path '*/node_modules' -prune -o -type d \( -name coverage -o -name lib -o -name dist \) -prune -exec rm -rf {} +
find . -name '*.tsbuildinfo' -type f -delete
