#!/usr/bin/env bash
# Verifies that a downloaded workflow artifact is byte-for-byte what the
# `prepare` job uploaded. The expected list is the base64-encoded `sha256sum`
# output recorded as a *job output* by `prepare`: job outputs are fixed once the
# job ends, while the artifact store of a running workflow can be re-uploaded by
# any step of any later job (audit P4-M-10). Every listed file must be present
# with its digest, and no file may exist that the list does not name.
#
# Usage: verify-artifact-digests.sh <directory> <base64 sha256sum output>
set -euo pipefail

if [[ $# -ne 2 ]]; then
	echo "Usage: $0 <directory> <base64 sha256sum output>" >&2
	exit 2
fi

directory=$1
expected=$(printf '%s' "$2" | base64 -d)

if [[ -z ${expected} ]]; then
	echo "verify-artifact-digests: the expected digest list is empty" >&2
	exit 1
fi

cd "${directory}"

# Every expected file must exist with the recorded digest (--strict also
# rejects a malformed list line instead of skipping it).
printf '%s\n' "${expected}" | sha256sum --check --strict --quiet - >&2

# Nothing unexpected may be present.
names=$(printf '%s\n' "${expected}" | sed -E 's/^[0-9a-f]{64} [ *]//')
status=0
while IFS= read -r -d '' file; do
	file=${file#./}
	if ! grep -qxF -- "${file}" <<<"${names}"; then
		echo "verify-artifact-digests: unexpected file in artifact: ${file}" >&2
		status=1
	fi
done < <(find . -type f -print0)

if [[ ${status} -ne 0 ]]; then
	exit "${status}"
fi

echo "verify-artifact-digests: $(printf '%s\n' "${expected}" | wc -l | tr -d ' ') file(s) in ${directory} match the recorded digests"
