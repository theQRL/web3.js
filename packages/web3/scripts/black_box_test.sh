#!/usr/bin/env bash
# Manual black-box smoke test (not run in CI): installs the published
# @theqrl/web3 release named in test/{esm,cjs}_black_box/package.json from the
# public registry (--ignore-workspace) and runs each project's suite against a
# local gqrl node started with `pnpm run pos:start` (HTTP on 8545, WS on 8546).
#
# Usage: ./scripts/black_box_test.sh gqrl <http | ws>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=./env.sh
. "${SCRIPT_DIR}/env.sh"

helpFunction() {
	echo "Usage: $0 <gqrl> <http | ws>"
	exit 1 # Exit script after printing help
}

BACKEND=${1:-}
MODE=${2:-}

SUPPORTED_BACKENDS=("gqrl")
SUPPORTED_MODE=("http" "ws")

if [[ ! " ${SUPPORTED_BACKENDS[*]} " =~ " ${BACKEND} " ]]; then
	helpFunction
fi

if [[ ! " ${SUPPORTED_MODE[*]} " =~ " ${MODE} " ]]; then
	helpFunction
fi

# The local testnet publishes the execution-layer HTTP RPC on 8545 and the
# WebSocket endpoint on 8546 (scripts/local_testnet/network_params.yaml).
if [[ ${MODE} == "ws" ]]; then
	export WEB3_SYSTEM_TEST_PORT=8546
fi

echo "RPC client Provider: ${BACKEND}"
echo "RPC client Protocol: ${MODE}"

export WEB3_SYSTEM_TEST_PROVIDER="${MODE}://localhost:${WEB3_SYSTEM_TEST_PORT}"
export WEB3_SYSTEM_TEST_BACKEND=${BACKEND}

# Both suites run from their own directory; `set -e` stops at the first failing
# install or suite instead of silently re-running the previous one.
for project in esm_black_box cjs_black_box; do
	cd "${PACKAGE_DIR}/test/${project}"
	pnpm install --ignore-workspace --no-frozen-lockfile
	pnpm run "test:${BACKEND}:${MODE}"
done
