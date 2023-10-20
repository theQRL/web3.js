#!/usr/bin/env bash
# TODO: use this code in #5185
ORIGARGS=("$@")
. scripts/env.sh

helpFunction() {
	echo "Usage: $0 [start|stop] [background]"
	exit 1 # Exit script after printing help
}

download(){
    if [ ! -e "$TMP_FOLDER/go-zond" ]
    then
        git clone https://github.com/cyyber/go-zond ${TMP_FOLDER}/go-zond
    fi

	if [ ! -e "$TMP_FOLDER/qrysm" ]
    then
        git clone https://github.com/cyyber/qrysm ${TMP_FOLDER}/qrysm
    fi
}

buildQrysm() {
	cd ${TMP_FOLDER}/qrysm
	go build -o=${TMP_FOLDER}/bin/beacon-chain ./cmd/beacon-chain
	go build -o=${TMP_FOLDER}/bin/validator ./cmd/validator
	go build -o=${TMP_FOLDER}/bin/prysmctl ./cmd/prysmctl
	cd ..
	cd ..
}

buildGeth() {
	cd ${TMP_FOLDER}/go-zond && make geth
	cp ${TMP_FOLDER}/go-zond/build/bin/geth ${TMP_FOLDER}/bin
	cd ..
	cd ..
}

start() {
	download
	buildQrysm

	echo "Create network files..."
	GENESIS_TIME=$(bash python scripts/update-time.py $TMP_FOLDER | tail -n 1)
	${TMP_FOLDER}/bin/prysmctl testnet generate-genesis \
		--fork=capella \
		--num-validators=64 \
		--geth-genesis-json-in=scripts/execution/genesis.json \
		--output-ssz=scripts/consensus/genesis.ssz \
		--chain-config-file=scripts/consensus/config.yml \
		--deposit-json-file=scripts/consensus/validator_keys/deposit_data-1694686035.json  \
		--genesis-time="${GENESIS_TIME}"

	buildGeth

	echo "Importing genesis file..."
	${TMP_FOLDER}/bin/geth \
		--datadir=${TMP_FOLDER}/data \
		init \
		scripts/execution/genesis.json

	echo "Starting geth..."
	${TMP_FOLDER}/bin/geth \
		--datadir=${TMP_FOLDER}/data \
		--ipcpath $IPC_PATH \
		--nodiscover \
		--nousb \
		--ws --ws.addr 0.0.0.0 --ws.port $WEB3_SYSTEM_TEST_PORT \
		--http --http.addr 0.0.0.0 --http.port $WEB3_SYSTEM_TEST_PORT \
		--allow-insecure-unlock \
		--http.api personal,web3,zond,admin,debug,txpool,net \
		--ws.api personal,web3,zond,admin,debug,miner,txpool,net \
		--syncmode=full \
		--rpc.enabledeprecatedpersonal >> ${TMP_FOLDER}/logs/geth.log 2>&1 &
	
	echo "Waiting for geth..."
	npx wait-port -t 10000 "$WEB3_SYSTEM_TEST_PORT"

	echo "Starting beacon node..."
	${TMP_FOLDER}/bin/beacon-chain \
		--datadir=${TMP_FOLDER}/data/beacondata \
		--min-sync-peers=0 \
		--genesis-state=scripts/consensus/genesis.ssz \
		--bootstrap-node= \
		--chain-config-file=scripts/consensus/config.yml \
		--config-file=scripts/consensus/config.yml \
		--chain-id=32382 \
		--execution-endpoint=http://localhost:8551 \
		--accept-terms-of-use \
		--jwt-secret=${TMP_FOLDER}/data/geth/jwtsecret \
		--contract-deployment-block=0 \
		--suggested-fee-recipient=0x123463a4b065722e99115d6c222f267d9cabb524 \
		--enable-debug-rpc-endpoints >> ${TMP_FOLDER}/logs/beacon.log 2>&1 &

	echo "Waiting for validator..."
	npx wait-port -t 10000 "4000"

	echo "Starting validator..."
	${TMP_FOLDER}/bin/validator \
		--datadir=${TMP_FOLDER}/data/validatordata \
		--accept-terms-of-use \
		--chain-config-file=scripts/consensus/config.yml \
		--config-file=scripts/consensus/config.yml \
		--wallet-dir=scripts/consensus/prysm-wallet-v2 \
		--wallet-password-file=scripts/consensus/wallet_password.txt \
		--rpc >> ${TMP_FOLDER}/logs/validator.log 2>&1 &

	echo "Waiting for validator..."
	npx wait-port -t 10000 "7000"
}

stop() {
	echo "Stopping geth..."
    gethProcessID=`lsof -Fp -i:${WEB3_SYSTEM_TEST_PORT}| grep '^p'`
	kill -9 ${gethProcessID##p}

	echo "Stopping beacon node..."
    beaconProcessID=`lsof -Fp -i:4000| grep '^p'`
	kill -9 ${beaconProcessID##p}

	echo "Stopping validator..."
	validatorProcessID=`lsof -Fp -i:7000| grep '^p'`
	kill -9 ${validatorProcessID##p}

	rm -r ${TMP_FOLDER}/data
}

case $1 in
start) start ;;
stop) stop ;;
*) helpFunction ;; # Print helpFunction in case parameter is non-existent
esac
