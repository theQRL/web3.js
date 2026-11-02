#!/usr/bin/env sh

# This file is part of web3.js and is licensed under LGPL-3.0-or-later.
set -eu
cd /work
for seed in /work/seed-*.txt; do
  clef importraw --suppress-bootwarn --keystore=/work/keystore --password=/work/password.txt "$seed"
done
printf '%s\n%s\n' web3-local-dev-only web3-local-dev-only | clef --configdir=/work/clef --suppress-bootwarn init
digest=$(sha256sum /work/rules.js | cut -d ' ' -f 1)
printf '%s\n' web3-local-dev-only | clef --configdir=/work/clef --suppress-bootwarn attest "$digest"
while read -r address; do
  printf '%s\n%s\n%s\n' web3-local-dev-only web3-local-dev-only web3-local-dev-only | clef --configdir=/work/clef --keystore=/work/keystore --suppress-bootwarn setpw "$address"
done < /work/addresses.txt
gqrl --datadir=/work/node --state.scheme=hash --cache=128 init /work/genesis.json
