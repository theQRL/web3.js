# Local Testnet (Kurtosis)

## Start / Stop

- Start: `pnpm run pos:start`
- Stop: `pnpm run pos:stop`

The network comes from [`theQRL/qrl-package`](https://github.com/theQRL/qrl-package), pinned to
[`25d3a1c53009`](https://github.com/theQRL/qrl-package/commit/25d3a1c53009294f06644c5b49c1011cf86ad0a5)
in `start_local_testnet.sh`. Kurtosis loads that revision directly from GitHub. Startup requires
Docker, Kurtosis, and access to GitHub and the image registry.

The network uses eight slots per epoch. The pinned package sets 64 epochs per execution voting
period, preserving the 512-slot limit compiled into the mainnet qrysm images.

## Client images

The default network requires a Linux AMD64 Docker host. The go-qrl and genesis-generator images
in this set are AMD64-only.

`network_params.yaml` selects clients and helpers using published image tags.

| Service                               | Image                                         |
| ------------------------------------- | --------------------------------------------- |
| Execution node                        | `qrledger/go-qrl:stable`                      |
| Clef and Clef account preparation     | `qrledger/go-qrl:alltools-stable`             |
| Beacon node                           | `qrledger/qrysm:beacon-chain-latest`          |
| Validator                             | `qrledger/qrysm:validator-latest`             |
| Genesis and validator key preparation | `qrledger/qrysm:qrl-genesis-generator-latest` |

The generator embeds the deposit contract and includes `deposit`, `validator`, and `qrysmctl`.
It must support 64-byte addresses and the five-argument deposit contract, including
`randao_commitment`. This package uses the generator for those helper commands; a separate
qrysm alltools image is not used.

When updating this set:

1. Build and publish compatible client and generator images under the tags above.
2. Inspect each published image with `docker buildx imagetools inspect <repository>:<tag>`.
   Confirm that `linux/amd64` is supported, then refresh the local image with
   `docker pull <repository>:<tag>`. Kurtosis normally reuses cached images.
3. Recreate the testnet and run both transport suites below to check compatibility.

These settings cover the QRL clients and their genesis/signing helpers. Kurtosis also runs its
own infrastructure and utility containers.

## Endpoints

`network_params.yaml` publishes the execution layer on fixed host ports, so the HTTP RPC is always
`http://127.0.0.1:8545` and the WS RPC `ws://127.0.0.1:8546` — the endpoints `scripts/test-runner.sh` hands
to the test suites. Only one enclave can hold those ports, so stop a running testnet before
starting another.

## Integration tests

After starting the network, run:

```sh
pnpm run test:e2e:gqrl:http
pnpm run test:e2e:gqrl:ws
```

These use the compiled contract fixtures and cover deployment, calls, transactions, events,
and revert handling. WebSocket subscriptions are exercised by the WS suite.

To run only the contract integration suite against these images:

```sh
. scripts/env.sh
WEB3_SYSTEM_TEST_MODE=http WEB3_SYSTEM_TEST_PROVIDER=http://127.0.0.1:8545 \
  pnpm --filter @theqrl/web3-qrl-contract run test:integration
WEB3_SYSTEM_TEST_MODE=ws WEB3_SYSTEM_TEST_PROVIDER=ws://127.0.0.1:8546 \
  pnpm --filter @theqrl/web3-qrl-contract run test:integration
```

## Accounts

`network_params.yaml` sets `remote_signer_auto_approve: true`, so the package provisions the
`signer-clef` service with ten development accounts, already imported into the clef keystore,
prefunded at genesis, and approved by an attested clef ruleset. Nothing has to be imported or
patched after the network is up.

Those same ten accounts are listed in `scripts/accounts.json`, which the system tests read through
`scripts/system_tests_utils.ts`. Tests can therefore either sign locally with the seed or send
`from` the account and let the node sign through clef.

When bumping `QRL_PKG_VERSION`, regenerate `scripts/accounts.json` if the package's development
accounts changed — the tests and clef must agree on the same set.

### Notes

- Development networks only: anyone who can reach the node can spend from these accounts.
- The seeds are publicly known dev keys — never fund them on a real network.
