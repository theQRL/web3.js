/*
This file is part of web3.js.

web3.js is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

web3.js is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
import { isHexPrefixed, isHexString } from '@theqrl/web3-validator';
import { bytesToHex, hexToBytes, numberToHex } from '@theqrl/web3-utils';
import { Hardfork } from './enums.js';
import { ToBytesInputTypes, TypeOutput, TypeOutputReturnType } from './types.js';

type ConfigHardfork =
	| { name: string; block: null; timestamp: number }
	| { name: string; block: number; timestamp?: number };

/**
 * Removes '0x' from a given `String` if present
 * @param str the string value
 * @returns the string without 0x prefix
 */
export const stripHexPrefix = (str: string): string => {
	if (typeof str !== 'string')
		throw new Error(`[stripHexPrefix] input must be type 'string', received ${typeof str}`);

	return isHexPrefixed(str) ? str.slice(2) : str;
};

/**
 * Converts a `Number` into a hex `String`
 * @param {Number} i
 * @return {String}
 */
const intToHex = function (i: number) {
	if (!Number.isSafeInteger(i) || i < 0) {
		throw new Error(`Received an invalid integer type: ${i}`);
	}
	return `0x${i.toString(16)}`;
};

/**
 * Converts Gqrl genesis parameters to a `CommonOpts` object
 * @param json object representing the Gqrl genesis file hardfork
 * @returns genesis parameters in a `CommonOpts` compliant object
 */
function parseGqrlParams(json: any) {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const {
		name,
		config,
		mixHash,
		gasLimit,
		coinbase,
		baseFeePerGas,
	}: {
		name: string;
		config: any;
		mixHash: string;
		gasLimit: string;
		coinbase: string;
		baseFeePerGas: string;
	} = json;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	let { extraData, timestamp }: { extraData: string; timestamp: string } = json;
	const genesisTimestamp = Number(timestamp);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const { chainId }: { chainId: number } = config;

	// gqrl is not strictly putting empty fields with a 0x prefix
	if (extraData === '') {
		extraData = '0x';
	}
	// gqrl may use number for timestamp
	if (!isHexPrefixed(timestamp)) {
		timestamp = intToHex(parseInt(timestamp));
	}

	const params = {
		name,
		chainId,
		networkId: chainId,
		genesis: {
			timestamp,
			gasLimit: parseInt(gasLimit), // gqrl gasLimit is an hex string while ours is a `number`
			extraData,
			mixHash,
			coinbase,
			baseFeePerGas,
		},
		hardfork: undefined as string | undefined,
		hardforks: [] as ConfigHardfork[],
		bootstrapNodes: [],
		consensus: {
			type: 'pos',
			algorithm: 'casper',
			casper: {},
		},
	};

	const forkMap: { [key: string]: { name: string; isTimestamp?: boolean } } = {
		// [Hardfork.Zond]: { name: 'zondTime', isTimestamp: true },
	};

	// forkMapRev is the map from config field name to Hardfork
	const forkMapRev = Object.keys(forkMap).reduce<{ [key: string]: string }>((acc, elem) => {
		acc[forkMap[elem].name] = elem;
		return acc;
	}, {});
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	const configHardforkNames = Object.keys(config).filter(
		// eslint-disable-next-line no-null/no-null, @typescript-eslint/no-unsafe-member-access
		key => forkMapRev[key] !== undefined && config[key] !== undefined && config[key] !== null,
	);

	params.hardforks = configHardforkNames
		.map(nameBlock => ({
			name: forkMapRev[nameBlock],
			block:
				forkMap[forkMapRev[nameBlock]].isTimestamp === true ||
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				typeof config[nameBlock] !== 'number'
					? // eslint-disable-next-line no-null/no-null
					  null
					: // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					  config[nameBlock],
			timestamp:
				forkMap[forkMapRev[nameBlock]].isTimestamp === true &&
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				typeof config[nameBlock] === 'number'
					? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					  config[nameBlock]
					: undefined,
		}))
		// eslint-disable-next-line no-null/no-null
		.filter(fork => fork.block !== null || fork.timestamp !== undefined) as ConfigHardfork[];

	params.hardforks.sort(
		(a: ConfigHardfork, b: ConfigHardfork) => (a.block ?? Infinity) - (b.block ?? Infinity),
	);

	params.hardforks.sort(
		(a: ConfigHardfork, b: ConfigHardfork) =>
			(a.timestamp ?? genesisTimestamp) - (b.timestamp ?? genesisTimestamp),
	);

	const latestHardfork = params.hardforks.length > 0 ? params.hardforks.slice(-1)[0] : undefined;
	params.hardfork = latestHardfork?.name;
	params.hardforks.unshift({ name: Hardfork.Zond, block: 0 });

	return params;
}

/**
 * Parses a genesis.json exported from Gqrl into parameters for Common instance
 * @param json representing the Gqrl genesis file
 * @param name optional chain name
 * @returns parsed params
 */
export function parseGqrlGenesis(json: any, name?: string) {
	try {
		if (['config', 'gasLimit', 'alloc'].some(field => !(field in json))) {
			throw new Error('Invalid format, expected gqrl genesis fields missing');
		}
		if (name !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			json.name = name;
		}
		return parseGqrlParams(json);
	} catch (e: any) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		throw new Error(`Error parsing parameters file: ${e.message}`);
	}
}

/**
 * Pads a `String` to have an even length
 * @param value
 * @return output
 */
export function padToEven(value: string): string {
	let a = value;

	if (typeof a !== 'string') {
		throw new Error(`[padToEven] value must be type 'string', received ${typeof a}`);
	}

	if (a.length % 2) a = `0${a}`;

	return a;
}

/**
 * Converts an `Number` to a `Uint8Array`
 * @param {Number} i
 * @return {Uint8Array}
 */
export const intToUint8Array = function (i: number) {
	const hex = intToHex(i);
	return hexToBytes(`0x${padToEven(hex.slice(2))}`);
};

/**
 * Attempts to turn a value into a `Uint8Array`.
 * Inputs supported: `Uint8Array` `String` (hex-prefixed), `Number`, null/undefined, `BigInt` and other objects
 * with a `toArray()` or `toUint8Array()` method.
 * @param v the value
 */
export const toUint8Array = function (v: ToBytesInputTypes): Uint8Array {
	// eslint-disable-next-line no-null/no-null
	if (v === null || v === undefined) {
		return new Uint8Array();
	}

	if (v instanceof Uint8Array) {
		return v;
	}

	if (Array.isArray(v)) {
		// Only a flat array of byte values is a byte string. A nested array (an RLP list decoded
		// where a string was expected) or an out-of-range element must not be coerced silently.
		if (
			!v.every(
				(item: unknown) =>
					typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255,
			)
		) {
			throw new Error(
				'Cannot convert array to Uint8Array: every element must be an integer between 0 and 255',
			);
		}
		return Uint8Array.from(v);
	}

	if (typeof v === 'string') {
		if (!isHexString(v)) {
			throw new Error(
				`Cannot convert string to Uint8Array. only supports 0x-prefixed hex strings and this string was given: ${v}`,
			);
		}
		return hexToBytes(padToEven(stripHexPrefix(v)));
	}

	if (typeof v === 'number') {
		return toUint8Array(numberToHex(v));
	}

	if (typeof v === 'bigint') {
		if (v < BigInt(0)) {
			throw new Error(`Cannot convert negative bigint to Uint8Array. Given: ${v}`);
		}
		let n = v.toString(16);
		if (n.length % 2) n = `0${n}`;
		return toUint8Array(`0x${n}`);
	}

	if (v.toArray) {
		// converts a BN to a Uint8Array
		return Uint8Array.from(v.toArray());
	}

	throw new Error('invalid type');
};

/**
 * Converts a {@link Uint8Array} to a {@link bigint}
 */
export function uint8ArrayToBigInt(buf: Uint8Array) {
	const hex = bytesToHex(buf);
	if (hex === '0x') {
		return BigInt(0);
	}
	return BigInt(hex);
}

/**
 * Converts a {@link bigint} to a {@link Uint8Array}
 */
export function bigIntToUint8Array(num: bigint) {
	return toUint8Array(`0x${num.toString(16)}`);
}

/**
 * Returns a Uint8Array filled with 0s.
 * @param bytes the number of bytes the Uint8Array should be
 */
export const zeros = function (bytes: number): Uint8Array {
	return new Uint8Array(bytes).fill(0);
};

/**
 * Pads a `Uint8Array` with zeros till it has `length` bytes.
 * Truncates the beginning or end of input if its length exceeds `length`.
 * @param msg the value to pad (Uint8Array)
 * @param length the number of bytes the output should be
 * @param right whether to start padding form the left or right
 * @return (Uint8Array)
 */
const setLength = function (msg: Uint8Array, length: number, right: boolean) {
	const buf = zeros(length);
	if (right) {
		if (msg.length < length) {
			buf.set(msg);
			return buf;
		}
		return msg.subarray(0, length);
	}
	if (msg.length < length) {
		buf.set(msg, length - msg.length);
		return buf;
	}
	return msg.subarray(-length);
};

/**
 * Throws if input is not a Uint8Array
 * @param {Uint8Array} input value to check
 */
export function assertIsUint8Array(input: unknown): asserts input is Uint8Array {
	if (!(input instanceof Uint8Array)) {
		// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
		const msg = `This method only supports Uint8Array but input was: ${input}`;
		throw new Error(msg);
	}
}
/**
 * Left Pads a `Uint8Array` with leading zeros till it has `length` bytes.
 * Or it truncates the beginning if it exceeds.
 * @param msg the value to pad (Uint8Array)
 * @param length the number of bytes the output should be
 * @return (Uint8Array)
 */
export const setLengthLeft = function (msg: Uint8Array, length: number) {
	assertIsUint8Array(msg);
	return setLength(msg, length, false);
};

/**
 * Trims leading zeros from a `Uint8Array`, `String` or `Number[]`.
 * @param a (Uint8Array|Array|String)
 * @return (Uint8Array|Array|String)
 */
export function stripZeros<T extends Uint8Array | number[] | string>(a: T): T {
	let first = a[0];
	while (a.length > 0 && first.toString() === '0') {
		a = a.slice(1) as T;
		first = a[0];
	}
	return a;
}

/**
 * Trims leading zeros from a `Uint8Array`.
 * @param a (Uint8Array)
 * @return (Uint8Array)
 */
export const unpadUint8Array = function (a: Uint8Array): Uint8Array {
	assertIsUint8Array(a);
	return stripZeros(a);
};

/**
 * Converts a {@link bigint} to a `0x` prefixed hex string
 */
export const bigIntToHex = (num: bigint) => `0x${num.toString(16)}`;

/**
 * Convert value from bigint to an unpadded Uint8Array
 * (useful for RLP transport)
 * @param value value to convert
 */
export function bigIntToUnpaddedUint8Array(value: bigint): Uint8Array {
	return unpadUint8Array(bigIntToUint8Array(value));
}

/**
 * Convert an input to a specified type.
 * Input of null/undefined returns null/undefined regardless of the output type.
 * @param input value to convert
 * @param outputType type to output
 */
export function toType<T extends TypeOutput>(input: null, outputType: T): null;
export function toType<T extends TypeOutput>(input: undefined, outputType: T): undefined;
export function toType<T extends TypeOutput>(
	input: ToBytesInputTypes,
	outputType: T,
): TypeOutputReturnType[T];
export function toType<T extends TypeOutput>(
	input: ToBytesInputTypes,
	outputType: T,
): TypeOutputReturnType[T] | undefined | null {
	// eslint-disable-next-line no-null/no-null
	if (input === null) {
		// eslint-disable-next-line no-null/no-null
		return null;
	}
	if (input === undefined) {
		return undefined;
	}

	if (typeof input === 'string' && !isHexString(input)) {
		throw new Error(`A string must be provided with a 0x-prefix, given: ${input}`);
	} else if (typeof input === 'number' && !Number.isSafeInteger(input)) {
		throw new Error(
			'The provided number is greater than MAX_SAFE_INTEGER (please use an alternative input type)',
		);
	}

	const output = toUint8Array(input);

	switch (outputType) {
		case TypeOutput.Uint8Array:
			return output as TypeOutputReturnType[T];
		case TypeOutput.BigInt:
			return uint8ArrayToBigInt(output) as TypeOutputReturnType[T];
		case TypeOutput.Number: {
			const bigInt = uint8ArrayToBigInt(output);
			if (bigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
				throw new Error(
					'The provided number is greater than MAX_SAFE_INTEGER (please use an alternative output type)',
				);
			}
			return Number(bigInt) as TypeOutputReturnType[T];
		}
		case TypeOutput.PrefixedHexString:
			return bytesToHex(output) as TypeOutputReturnType[T];
		default:
			throw new Error('unknown outputType');
	}
}
