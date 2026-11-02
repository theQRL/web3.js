#!/usr/bin/env bash

ORIGARGS=("$@")

. scripts/env.sh

helpFunction() {
	echo "Usage: $0 <gqrl | testnet | mainnet> <http | ws> [node | electron | firefox | chrome] [coverage]"
	exit 1 # Exit script after printing help
}
BACKEND=${ORIGARGS[0]}
MODE=${ORIGARGS[1]}
ENGINE=${ORIGARGS[2]}
TEST_OPTION=${ORIGARGS[3]}

SUPPORTED_BACKENDS=("gqrl" "testnet" "mainnet")
SUPPORTED_MODE=("http" "ws")
# if you will add a new browser please also add it in the system_test_utils.ts => isBrowser
SUPPORTED_ENGINES=("node" "electron" "firefox" "chrome" "")
SUPPORTED_TEST_OPTIONS=("coverage" "")

if [[ ! " ${SUPPORTED_BACKENDS[*]} " =~ " ${BACKEND} " ]]; then
	helpFunction
fi

if [[ ! " ${SUPPORTED_MODE[*]} " =~ " ${MODE} " ]]; then
	helpFunction
fi

if [[ ! " ${SUPPORTED_ENGINES[*]} " =~ " ${ENGINE} " ]]; then
	helpFunction
fi

if [[ ! " ${SUPPORTED_TEST_OPTIONS[*]} " =~ " ${TEST_OPTION} " ]]; then
	helpFunction
fi

if [[ $MODE == "ws" ]]; then
	export WEB3_SYSTEM_TEST_PORT=8546
fi

echo "Node software used for tests: " $BACKEND
echo "Node running on: " "$MODE://127.0.0.1:$WEB3_SYSTEM_TEST_PORT"

export WEB3_SYSTEM_TEST_MODE=$MODE
export WEB3_SYSTEM_TEST_PROVIDER="$MODE://127.0.0.1:$WEB3_SYSTEM_TEST_PORT"
export WEB3_SYSTEM_TEST_BACKEND=$BACKEND
export WEB3_SYSTEM_TEST_ENGINE=$ENGINE

TEST_COMMAND_KIND=""
TEST_TASK=""

if [[ $ENGINE == "node" ]] || [[ $ENGINE == "" ]]; then
	if [[ $TEST_OPTION == "coverage" ]]; then
		TEST_COMMAND_KIND="script"
		TEST_TASK="test:coverage:integration"
	elif [[ $BACKEND == "testnet" || $BACKEND == "mainnet" ]]; then
		TEST_COMMAND_KIND="turbo"
		TEST_TASK="test:e2e:$BACKEND"
	else
		TEST_COMMAND_KIND="script"
		TEST_TASK="test:integration"
	fi
else
	TEST_COMMAND_KIND="turbo"
	TEST_TASK="test:e2e:$ENGINE"
fi

if [[ $TEST_COMMAND_KIND == "turbo" ]]; then
	pnpm exec turbo run "$TEST_TASK"
else
	pnpm run "$TEST_TASK"
fi
