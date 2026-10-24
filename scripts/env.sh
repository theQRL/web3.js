#!/usr/bin/env bash

export WEB3_SYSTEM_TEST_ENV=true
export WEB3_SYSTEM_TEST_BACKEND="gqrl"
# Public local-dev fixture mnemonic only. Override this environment variable for
# any non-local test run.
export WEB3_SYSTEM_TEST_MNEMONIC="${WEB3_SYSTEM_TEST_MNEMONIC:-smart guide what forget tired jungle always expire rescue boring glue champion}"
export WEB3_SYSTEM_TEST_PORT=8545
export WEB3_SYSTEM_TEST_PROVIDER="http://localhost:8545"
