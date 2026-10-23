#!/usr/bin/env bash

# This file is part of web3.js and is licensed under LGPL-3.0-or-later.
# A disposable execution-layer chain using public development accounts only.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${1:-$(mktemp -d /tmp/web3-execution.XXXXXX)}"
mkdir -p -- "$STATE_DIR"
STATE_DIR="$(cd -- "$STATE_DIR" && pwd)"
CONTAINER="web3-execution-$$"
# go-qrl 0.3.3-stable, commit f3864c46; includes the matching clef binary.
IMAGE=qrledger/go-qrl@sha256:72fb2a117d61d899e6cb763b91f1a37da4ab544a74530885032c99b4d7547912
# Pin the launcher, its children and the container to the same two host CPUs.
CPU_SET=0,1
taskset -pc "$CPU_SET" "$$" >/dev/null
export GOMAXPROCS=2 UV_THREADPOOL_SIZE=2 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2
export NODE_OPTIONS="${NODE_OPTIONS:-} --v8-pool-size=1"

node "$SCRIPT_DIR/prepare_execution_testnet.js" "$STATE_DIR"
cp "$SCRIPT_DIR/setup_execution_testnet.sh" "$STATE_DIR/setup.sh"
cp "$SCRIPT_DIR/run_execution_node.sh" "$STATE_DIR/start.sh"
DOCKER_ARGS=(--cpuset-cpus="$CPU_SET" --cpus=2 --user="$(id -u):$(id -g)"
  -e GOMAXPROCS=2 -e OMP_NUM_THREADS=2 --mount "type=bind,source=$STATE_DIR,target=/work" --workdir=/work)

docker run --rm --network=none "${DOCKER_ARGS[@]}" "$IMAGE" sh /work/setup.sh >"$STATE_DIR/setup.log" 2>&1
STARTED=false
cleanup() {
  if "$STARTED"; then
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker run -d --rm --name "$CONTAINER" "${DOCKER_ARGS[@]}" \
  -p 127.0.0.1:18545:8545 -p 127.0.0.1:18546:8546 -p 127.0.0.1:18551:8551 \
  "$IMAGE" sh /work/start.sh
STARTED=true
printf 'State and logs: %s\nHTTP: http://127.0.0.1:18545\nWS: ws://127.0.0.1:18546\nIPC: %s/node/gqrl.ipc\n' "$STATE_DIR" "$STATE_DIR"
node "$SCRIPT_DIR/execution_miner.js" "$STATE_DIR"
