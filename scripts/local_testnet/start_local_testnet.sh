#!/usr/bin/env bash

# Requires `docker`, `kurtosis`; CI mode also requires `yq`

set -Eeuo pipefail

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ENCLAVE_NAME=local-testnet
NETWORK_PARAMS_FILE=$SCRIPT_DIR/network_params.yaml
QRL_PKG=github.com/theQRL/qrl-package
# Pinned so local runs and CI get the same network. Bump deliberately.
QRL_PKG_VERSION=25d3a1c53009294f06644c5b49c1011cf86ad0a5

CI=false
KEEP_ENCLAVE=false

# Get options
while getopts "e:b:n:phck" flag; do
  case "${flag}" in
    e) ENCLAVE_NAME=${OPTARG};;
    n) NETWORK_PARAMS_FILE=${OPTARG};;
    c) CI=true;;
    k) KEEP_ENCLAVE=true;;
    h)
        echo "Start a local testnet with kurtosis."
        echo
        echo "usage: $0 <Options>"
        echo
        echo "Options:"
        echo "   -e: enclave name                                default: $ENCLAVE_NAME"
        echo "   -n: kurtosis network params file path           default: $NETWORK_PARAMS_FILE"
        echo "   -c: CI mode, run without other additional services like Grafana and explorer"
        echo "   -k: keeping enclave to allow starting the testnet without destroying the existing one"
        echo "   -h: this help"
        exit
        ;;
  esac
done

if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker and try again."
    exit 1
fi

if ! command -v kurtosis &> /dev/null; then
    echo "kurtosis command not found. Please install kurtosis and try again."
    exit
fi

if ! command -v yq &> /dev/null; then
    echo "yq not found. Please install yq and try again."
fi

if [ "$CI" = true ]; then
  # TODO: run assertoor tests
  yq eval '.additional_services = []' -i $NETWORK_PARAMS_FILE
  echo "Running without additional services (CI mode)."
fi

if [ "$KEEP_ENCLAVE" = false ]; then
  # Stop local testnet
  kurtosis enclave rm -f $ENCLAVE_NAME 2>/dev/null || true
fi

kurtosis run --enclave "$ENCLAVE_NAME" "$QRL_PKG@$QRL_PKG_VERSION" --args-file "$NETWORK_PARAMS_FILE"

echo "Started!"
