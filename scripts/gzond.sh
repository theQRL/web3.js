#!/usr/bin/env bash

ORIGARGS=("$@")

helpFunction() {
	echo "Usage: $0 [start|stop] [background]"
	exit 1 # Exit script after printing help
}

start() {
	. scripts/env.sh
	if [ -z "${ORIGARGS[1]}" ]
	then
		echo "Starting gzond..."
		echo "docker run -p $WEB3_SYSTEM_TEST_PORT:$WEB3_SYSTEM_TEST_PORT theQRL/gzond:latest --nodiscover --ws --ws.addr 0.0.0.0 --ws.port $WEB3_SYSTEM_TEST_PORT --http --http.addr 0.0.0.0 --http.port $WEB3_SYSTEM_TEST_PORT --allow-insecure-unlock --http.api web3,eth,admin,debug,txpool,net --ws.api web3,eth,admin,debug,miner,txpool,net --dev"
        docker run -p $WEB3_SYSTEM_TEST_PORT:$WEB3_SYSTEM_TEST_PORT theQRL/gzond:latest --nodiscover --ws --ws.addr 0.0.0.0 --ws.port $WEB3_SYSTEM_TEST_PORT --http --http.addr 0.0.0.0 --http.port $WEB3_SYSTEM_TEST_PORT --allow-insecure-unlock --http.api web3,eth,admin,debug,txpool,net --ws.api web3,eth,admin,debug,miner,txpool,net --dev
	else
		echo "Starting gzond..."
		echo "docker run -d -p $WEB3_SYSTEM_TEST_PORT:$WEB3_SYSTEM_TEST_PORT theQRL/gzond:latest --nodiscover --ws --ws.addr 0.0.0.0 --ws.port $WEB3_SYSTEM_TEST_PORT --http --http.addr 0.0.0.0 --http.port $WEB3_SYSTEM_TEST_PORT --allow-insecure-unlock --http.api web3,eth,admin,debug,txpool,net --ws.api web3,eth,admin,debug,miner,txpool,net --dev"
        docker run -d -p $WEB3_SYSTEM_TEST_PORT:$WEB3_SYSTEM_TEST_PORT theQRL/gzond:latest --nodiscover --ws --ws.addr 0.0.0.0 --ws.port $WEB3_SYSTEM_TEST_PORT --http --http.addr 0.0.0.0 --http.port $WEB3_SYSTEM_TEST_PORT --allow-insecure-unlock --http.api web3,eth,admin,debug,txpool,net --ws.api web3,eth,admin,debug,miner,txpool,net --dev
		echo "Waiting for gzond..."
		npx wait-port -t 10000 "$WEB3_SYSTEM_TEST_PORT"
		echo "Gzond started"
	fi
}

stop() {
	echo "Stopping gzond ..."
	docker ps -q --filter ancestor="theQRL/gzond" | xargs -r docker stop
}

case $1 in
start) start ;;
stop) stop ;;
*) helpFunction ;; # Print helpFunction in case parameter is non-existent
esac
