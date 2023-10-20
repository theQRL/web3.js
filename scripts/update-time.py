#!/usr/bin/python3
import os
import subprocess
import sys
from time import time

base_path = sys.argv[1]


def read_file(absolute_path):
    f = open(absolute_path, "r")
    data = f.read()
    f.close()

    return data


def write_file(absolute_path, data):
    f = open(absolute_path, "w")
    f.write(data)
    f.close()


def update_time_geth_config(timestamp):
    target_file = os.path.join(base_path, "go-zond/params/config.go")
    data = read_file(target_file)

    config_start_loc = data.find("BetaNetChainConfig = &ChainConfig{")
    shanghai_time_start_loc = data.find("ShanghaiTime", config_start_loc)
    time_start_loc = data.find("newUint64(", shanghai_time_start_loc)

    data = data[:time_start_loc+10] + str(timestamp) + data[time_start_loc+20:]
    write_file(target_file, data)


def update_time_geth_genesis(timestamp):
    target_file = os.path.join(base_path, "go-zond/core/genesis.go")
    data = read_file(target_file)

    func_start_loc = data.find("func DefaultBetaNetGenesisBlock() *Genesis {")
    time_var_start_loc = data.find("Timestamp:", func_start_loc)
    time_end_loc = data.find(",", time_var_start_loc)
    time_start_loc = time_end_loc - 10

    data = data[:time_start_loc] + str(timestamp) + data[time_end_loc:]
    write_file(target_file, data)


def get_new_genesis_hash():
    result = subprocess.run(['go test -run TestGenesisHashes'],
                            cwd=os.path.join(base_path, 'go-zond/core'), shell=True, stdout=subprocess.PIPE)

    if result.returncode != 1:
        raise Exception("expected return code 1")

    output = result.stdout.decode()
    got_loc = output.find("got:")
    new_hash_loc = output.find("0x", got_loc)
    genesis_hash = output[new_hash_loc:new_hash_loc+66]

    return genesis_hash


def update_genesis_hash():
    genesis_hash = get_new_genesis_hash()

    target_file = os.path.join(base_path, "go-zond/params/config.go")
    data = read_file(target_file)

    genesis_hash_var_loc = data.find("BetaNetGenesisHash")
    genesis_hash_start_loc = data.find("0x", genesis_hash_var_loc)

    data = data[:genesis_hash_start_loc] + genesis_hash + data[genesis_hash_start_loc+66:]
    write_file(target_file, data)


# def update_prysmctl_command(timestamp):
#     target_file = os.path.join(base_path, "scripts/prysmctl.sh")
#     data = read_file(target_file)

#     genesis_time_flag_loc = data.find("--genesis-time")
#     equal_loc = data.find("=", genesis_time_flag_loc)
#     genesis_time_loc = equal_loc + 1

#     data = data[:genesis_time_loc] + str(timestamp) + data[genesis_time_loc+10:]
#     write_file(target_file, data)


def update_genesis_json(timestamp):
    target_file = "scripts/execution/genesis.json"
    data = read_file(target_file)

    timestamp_var_loc = data.find("timestamp")
    timestamp_loc = data.find("0x", timestamp_var_loc)

    data = data[:timestamp_loc] + hex(timestamp) + data[timestamp_loc+10:]
    write_file(target_file, data)


def main():
    timestamp = int(time()) + 120

    update_time_geth_config(timestamp)
    update_time_geth_genesis(timestamp)
    update_genesis_hash()
    #update_prysmctl_command(timestamp)
    update_genesis_json(timestamp)
    print(timestamp)
    sys.stdout.flush()

main()
