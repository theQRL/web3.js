"use strict";

import { getAddress } from "@ethersproject/address";
import { hexZeroPad } from "@ethersproject/bytes";
import { hexToAddress, addressToHex } from "@theqrl/web3-utils";

import { Coder, Reader, Writer } from "./abstract-coder";

export class AddressCoder extends Coder {

    constructor(localName: string) {
        super("address", "address", localName, false);
    }

    defaultValue(): string {
        return "Z0000000000000000000000000000000000000000";
    }

    encode(writer: Writer, value: string): number {
        try {
            value = getAddress(addressToHex(value))
        } catch (error: any) {
            this._throwError(error.message, value);
        }
        return writer.writeValue(value);
    }

    decode(reader: Reader): any {
        return hexToAddress(getAddress(hexZeroPad(reader.readValue().toHexString(), 20)));
    }
}

