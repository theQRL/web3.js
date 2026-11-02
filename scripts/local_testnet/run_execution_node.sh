#!/usr/bin/env sh

# This file is part of web3.js and is licensed under LGPL-3.0-or-later.
set -eu
printf '%s\n' web3-local-dev-only | clef --configdir=/work/clef --keystore=/work/keystore --suppress-bootwarn --advanced --chainid=1337 --rules=/work/rules.js --ipcpath=/work/clef.ipc > /work/clef.log 2>&1 &
for attempt in $(seq 1 60); do
  if [ -S /work/clef.ipc/clef.ipc ]; then break; fi
  sleep 1
done
test -S /work/clef.ipc/clef.ipc
exec gqrl --datadir=/work/node --cache=128 --state.scheme=hash --gcmode=archive --signer=/work/clef.ipc/clef.ipc --networkid=1337 --nodiscover --maxpeers=0 --http --http.addr=0.0.0.0 --http.api=qrl,net,web3,debug,txpool --http.vhosts=localhost,127.0.0.1 --ws --ws.addr=0.0.0.0 --ws.api=qrl,net,web3,debug,txpool --ws.origins=http://localhost,http://127.0.0.1 --authrpc.addr=0.0.0.0 --authrpc.jwtsecret=/work/jwt.hex --authrpc.vhosts=localhost,127.0.0.1 --rpc.txfeecap=0 --miner.gasprice=1 --miner.gaslimit=30000000 --ipcpath=/work/node/gqrl.ipc > /work/gqrl.log 2>&1
