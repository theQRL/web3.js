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

import { Transaction, FMT_BYTES, FMT_NUMBER, FormatType } from '@theqrl/web3-types';
import {
	ChainIdMismatchError,
	CommonOrChainAndHardforkError,
	InvalidGas,
	InvalidMaxPriorityFeePerGasOrMaxFeePerGas,
	InvalidNonceOrChainIdError,
	MissingChainOrHardforkError,
	MissingCustomChainError,
	MissingCustomChainIdError,
	MissingGasError,
} from '@theqrl/web3-errors';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const invalidTransactionObject: any[] = ['42', false, '0x0', BigInt(42), () => {}];

export const validateCustomChainInfoData: [
	FormatType<Transaction, { number: FMT_NUMBER.HEX; bytes: FMT_BYTES.HEX }> | any,
	undefined | MissingCustomChainError | MissingCustomChainIdError | ChainIdMismatchError,
][] = [
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					networkId: '0x4',
					chainId: '0x1',
				},
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingCustomChainError(),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					networkId: '0x4',
				},
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingCustomChainIdError(),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					networkId: '0x4',
					chainId: '0x42',
				},
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new ChainIdMismatchError({ txChainId: '0x1', customChainId: '0x42' }),
	],
];

export const validateChainInfoData: [
	FormatType<Transaction, { number: FMT_NUMBER.HEX; bytes: FMT_BYTES.HEX }> | any,
	undefined | CommonOrChainAndHardforkError | MissingChainOrHardforkError,
][] = [
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			chain: 'mainnet',
			hardfork: 'shanghai',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new CommonOrChainAndHardforkError(),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			chain: 'mainnet',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingChainOrHardforkError({
			chain: 'mainnet',
			hardfork: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			hardfork: 'shanghai',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingChainOrHardforkError({
			chain: undefined,
			hardfork: 'shanghai',
		}),
	],
];

export const validateGasData: [
	FormatType<Transaction, { number: FMT_NUMBER.HEX; bytes: FMT_BYTES.HEX }> | any,
	(
		| undefined
		| MissingGasError
		| InvalidGas
		| InvalidMaxPriorityFeePerGasOrMaxFeePerGas
	),
][] = [
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			maxFeePerGas: '0x1229298c00',
			maxPriorityFeePerGas: '0x49504f80',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingGasError({
			gas: undefined,
			maxPriorityFeePerGas: undefined,
			maxFeePerGas: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingGasError({
			gas: '0x5208',
			maxFeePerGas: undefined,
			maxPriorityFeePerGas: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingGasError({
			gas: '0x5208',
			maxFeePerGas: undefined,
			maxPriorityFeePerGas: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '-0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x4a817c800',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidGas({ gas: '-0x5208' }),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			maxFeePerGas: '0x1229298c00',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingGasError({
			gas: '0x5208',
			maxPriorityFeePerGas: undefined,
			maxFeePerGas: '0x1229298c00',
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			maxPriorityFeePerGas: '0x49504f80',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new MissingGasError({
			gas: '0x5208',
			maxPriorityFeePerGas: '0x49504f80',
			maxFeePerGas: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			maxFeePerGas: '-0x1229298c00',
			maxPriorityFeePerGas: '0x49504f80',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({
			maxPriorityFeePerGas: '0x49504f80',
			maxFeePerGas: '-0x1229298c00',
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			maxFeePerGas: '0x1229298c00',
			maxPriorityFeePerGas: '-0x49504f80',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chain: 'mainnet',
			hardfork: 'shanghai',
			chainId: '0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidMaxPriorityFeePerGasOrMaxFeePerGas({
			maxPriorityFeePerGas: '-0x49504f80',
			maxFeePerGas: '0x1229298c00',
		}),
	],
];

export const invalidNonceOrChainIdData: [
	FormatType<Transaction, { number: FMT_NUMBER.HEX; bytes: FMT_BYTES.HEX }> | any,
	undefined | InvalidNonceOrChainIdError,
][] = [
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		undefined,
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			chainId: '0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidNonceOrChainIdError({
			nonce: undefined,
			chainId: '0x1',
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidNonceOrChainIdError({
			nonce: '0x4',
			chainId: undefined,
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '-0x4',
			chainId: '0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidNonceOrChainIdError({
			nonce: '-0x4',
			chainId: '0x1',
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '-0x1',
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidNonceOrChainIdError({
			nonce: '0x4',
			chainId: '-0x1',
		}),
	],
	[
		{
			from: 'ZEB014f8c8B418Db6b45774c326A0E64C78914dC0',
			to: 'Z3535353535353535353535353535353535353535',
			value: '0x174876e800',
			gas: '0x5208',
			maxFeePerGas: '0x4a817c800',
			maxPriorityFeePerGas: '0x0',
			type: '0x2',
			data: '0x0',
			nonce: '0x4',
			chainId: '-0x1',
			common: {
				customChain: {
					name: 'foo',
					networkId: '0x4',
					chainId: '-0x1',
				},
				baseChain: 'mainnet',
				hardfork: 'shanghai',
			},
			gasLimit: '0x5208',
			publicKey: '0x4f4c17305743700648bc4f6cd3038ec6f6af0df73e31757007b7f59df7bee88d',
			signature: '0x7e1941b264348e80c78c4027afc65a87b0a5e43e86742b8ca0823584c6788fd0',
		},
		new InvalidNonceOrChainIdError({
			nonce: '0x4',
			chainId: '-0x1',
		}),
	],
];
