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

/* eslint-disable no-null/no-null -- exercise JSON-RPC nulls and omitted caller inputs */
import { runInNewContext } from 'vm';
import { LogsSubscription } from '../../src/web3_subscriptions';
import { Web3Context } from '@theqrl/web3-core';
import { InvalidResponseError, TransactionError } from '@theqrl/web3-errors';
import { Web3ValidatorError } from '@theqrl/web3-validator';
import {
	DEFAULT_RETURN_FORMAT as fmt,
	QRLExecutionAPI,
	FMT_NUMBER,
	FMT_BYTES,
	Filter,
} from '@theqrl/web3-types';
import { hexToBytes } from '@theqrl/web3-utils';
import * as rpc from '../../src/rpc_method_wrappers';
import { decodeSignedTransaction } from '../../src/utils/decode_signed_transaction';

const hash = `0x${'ab'.repeat(32)}`;
const otherHash = `0x${'cd'.repeat(32)}`;
const address = `Q${'ab'.repeat(64)}`;
const otherAddress = `Q${'cd'.repeat(64)}`;
const topic = `0x${'12'.repeat(64)}`;
const otherTopic = `0x${'34'.repeat(64)}`;
const context = (reply: unknown) =>
	new Web3Context<QRLExecutionAPI>({ provider: { request: jest.fn().mockResolvedValue(reply) } });
const tx = { hash: otherHash, blockHash: hash, blockNumber: '0x12', transactionIndex: '0x0' };
const log = { address, topics: [topic, otherTopic], data: '0x' };

test('snapshots raw log arguments, including nested topic alternatives (P13-QRL-1)', () => {
	const args = { address: [address], topics: [[topic]], fromBlock: 2, toBlock: 10 };
	const sub = new LogsSubscription(args, {
		subscriptionManager: context([]).subscriptionManager,
	});
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	args.address[0] = otherAddress;
	args.topics[0][0] = otherTopic;
	args.fromBlock = 3;
	args.toBlock = 12;
	expect(sub['_buildSubscriptionParams']()).toEqual([
		'logs',
		{
			address: [address],
			topics: [[topic]],
			fromBlock: '0x2',
			toBlock: '0xa',
		},
	]);
	sub._processSubscriptionResult(log);
	expect(data).toHaveBeenCalledTimes(1);
	expect(errors).not.toHaveBeenCalled();
	sub._processSubscriptionResult({ ...log, address: otherAddress });
	expect(errors).toHaveBeenCalledWith(expect.any(InvalidResponseError));
});

describe('RPC response identity', () => {
	it.each([hash, `0x${hash.slice(2).toUpperCase()}`, hexToBytes(hash)])(
		'checks block hashes before return formatting (%s)',
		async requested => {
			await expect(
				rpc.getBlock(context({ hash: otherHash }), requested, false, fmt),
			).rejects.toThrow(InvalidResponseError);
			await expect(rpc.getBlock(context({}), requested, false, fmt)).rejects.toThrow(
				InvalidResponseError,
			);
			await expect(
				rpc.getBlock(context({ hash }), requested, false, {
					number: FMT_NUMBER.STR,
					bytes: FMT_BYTES.UINT8ARRAY,
				}),
			).resolves.toHaveProperty('hash', hexToBytes(hash));
			await expect(
				rpc.getTransactionFromBlock(
					context({ ...tx, blockHash: otherHash }),
					requested,
					0,
					fmt,
				),
			).rejects.toThrow(InvalidResponseError);
			await expect(
				rpc.getTransactionFromBlock(context(tx), requested, 0, fmt),
			).resolves.toHaveProperty('blockHash', hash);
		},
	);
	it.each([18, BigInt(18), '18', '0x0012'])(
		'compares numeric block identifiers (%s)',
		async requested => {
			await expect(
				rpc.getBlock(context({ hash, number: '0x13' }), requested, false, fmt),
			).rejects.toThrow(InvalidResponseError);
			await expect(rpc.getBlock(context({ hash }), requested, false, fmt)).rejects.toThrow(
				InvalidResponseError,
			);
			await expect(
				rpc.getBlock(context({ hash, number: '0x12' }), requested, false, fmt),
			).resolves.toHaveProperty('number', BigInt(18));
			await expect(
				rpc.getTransactionFromBlock(
					context({ ...tx, blockNumber: '0x13' }),
					requested,
					0,
					fmt,
				),
			).rejects.toThrow(InvalidResponseError);
			await expect(
				rpc.getTransactionFromBlock(context(tx), requested, '0x00', fmt),
			).resolves.toHaveProperty('transactionIndex', BigInt(0));
		},
	);
	it.each([hash, 18, 'latest', 'safe', 'finalized'])(
		'checks indexes for block %s',
		async requested => {
			await expect(
				rpc.getTransactionFromBlock(
					context({ ...tx, transactionIndex: '0x1' }),
					requested,
					0,
					fmt,
				),
			).rejects.toThrow(InvalidResponseError);
			await expect(
				rpc.getTransactionFromBlock(
					context({ ...tx, transactionIndex: undefined }),
					requested,
					0,
					fmt,
				),
			).rejects.toThrow(InvalidResponseError);
		},
	);
	it.each(['latest', 'earliest', 'pending', 'safe', 'finalized'])(
		'preserves moving tag %s and null results',
		async tag => {
			await expect(
				rpc.getBlock(context({ hash, number: '0x12' }), tag, false, fmt),
			).resolves.toHaveProperty('hash', hash);
			await expect(rpc.getBlock(context(null), tag, false, fmt)).resolves.toBeNull();
			await expect(
				rpc.getTransactionFromBlock(context(null), tag, 0, fmt),
			).resolves.toBeNull();
		},
	);
	it('preserves pending transactions without mined locations', async () => {
		await expect(
			rpc.getTransactionFromBlock(
				context({ ...tx, blockHash: null, blockNumber: null, transactionIndex: null }),
				'pending',
				0,
				fmt,
			),
		).resolves.toHaveProperty('blockHash', null);
	});
	it.each([
		{ address: otherAddress },
		{ address: [otherAddress] },
		{ topics: [otherTopic] },
		{ topics: [[otherTopic]] },
		{ topics: [topic, null, null] },
		{ topics: [null, topic] },
	] as Filter[])('rejects logs outside filter %j', async filter => {
		await expect(rpc.getLogs(context([log]), filter, fmt)).rejects.toThrow(
			InvalidResponseError,
		);
	});
	it.each([
		{},
		{ address },
		{ address: [] },
		{ address: [otherAddress, address] },
		{ address: `Q${address.slice(1).toUpperCase()}` },
		{ topics: [] },
		{ topics: [null] },
		{ topics: [[]] },
		{ topics: [topic] },
		{ topics: [topic.slice(2)] },
		{ topics: [[otherTopic, topic], null] },
	] as Filter[])('accepts matching log filters %j', async filter => {
		await expect(
			rpc.getLogs(context([log]), filter, {
				number: FMT_NUMBER.STR,
				bytes: FMT_BYTES.UINT8ARRAY,
			}),
		).resolves.toHaveLength(1);
	});
	it('rejects absent log identity fields when constrained', async () => {
		await expect(rpc.getLogs(context([{ topics: [topic] }]), { address }, fmt)).rejects.toThrow(
			InvalidResponseError,
		);
		await expect(rpc.getLogs(context([{ address }]), { topics: [topic] }, fmt)).rejects.toThrow(
			InvalidResponseError,
		);
	});
});

test.each([null, undefined, 5, {}, true])(
	'keeps typed validation for raw transaction input %s',
	async input => {
		const request = jest.fn();
		const c = new Web3Context<QRLExecutionAPI>({ provider: { request } });
		expect(() => decodeSignedTransaction(input as never, fmt)).toThrow(Web3ValidatorError);
		const pending = rpc.sendSignedTransaction(c, input as never, fmt);
		const errors = jest.fn();
		pending.on('error', errors);
		await expect(pending).rejects.toThrow(Web3ValidatorError);
		expect(errors).toHaveBeenCalledTimes(1);
		expect(request).not.toHaveBeenCalled();
	},
);

test.each(['number', 'blockNumber', 'transactionIndex'] as const)(
	'names missing identity field %s (P12-QRL-3)',
	async field => {
		const result =
			field === 'number'
				? rpc.getBlock(context({ hash }), 18, false, fmt)
				: rpc.getTransactionFromBlock(context({ ...tx, [field]: undefined }), 18, 0, fmt);
		await expect(result).rejects.toThrow(`result.${field}`);
	},
);

test('refuses oversized cross-realm signed input before formatting or RPC (P12-QRL-1)', async () => {
	const input = runInNewContext('new Uint8Array(16 * 1024 * 1024 + 1)') as Uint8Array;
	const request = jest.fn();
	const c = new Web3Context<QRLExecutionAPI>({ provider: { request } });
	expect(() => decodeSignedTransaction(input as never, fmt)).toThrow(TransactionError);
	const pending = rpc.sendSignedTransaction(c, input, fmt);
	const errors = jest.fn();
	pending.on('error', errors);
	await expect(pending).rejects.toThrow(/maximum size/);
	expect(errors).toHaveBeenCalledTimes(1);
	expect(request).not.toHaveBeenCalled();
});

test.each([
	{
		filter: { address, topics: [topic] },
		entry: { ...log, address: otherAddress },
		matches: false,
	},
	{
		filter: { address, topics: [topic] },
		entry: { ...log, topics: [otherTopic] },
		matches: false,
	},
	{ filter: { topics: [topic] }, entry: { ...log, topics: [] }, matches: false },
	{ filter: { topics: [topic] }, entry: { address }, matches: false },
	{ filter: { address }, entry: { topics: [topic] }, matches: false },
	{
		filter: { address: [otherAddress, address], topics: [[otherTopic, topic], null] },
		entry: log,
		matches: true,
	},
	{ filter: { address: [], topics: [[]] }, entry: log, matches: true },
	{ filter: { topics: [topic.slice(2)] }, entry: log, matches: true },
	{ filter: {}, entry: log, matches: true },
])('checks raw log subscription identity (%j)', ({ filter, entry, matches }) => {
	const c = context([]);
	const sub = new LogsSubscription(filter, {
		subscriptionManager: c.subscriptionManager,
		returnFormat: { number: FMT_NUMBER.STR, bytes: FMT_BYTES.UINT8ARRAY },
	});
	const data = jest.fn();
	const errors = jest.fn();
	sub.on('data', data);
	sub.on('error', errors);
	sub._processSubscriptionResult(entry);
	expect(data).toHaveBeenCalledTimes(matches ? 1 : 0);
	expect(errors).toHaveBeenCalledTimes(matches ? 0 : 1);
	expect(errors.mock.calls.map(([error]) => error instanceof InvalidResponseError)).toEqual(
		matches ? [] : [true],
	);
});
