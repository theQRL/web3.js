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
import { Web3Context } from '@theqrl/web3-core';
import { format, sha3Raw } from '@theqrl/web3-utils';
import {
	Bytes,
	DataFormat,
	DEFAULT_RETURN_FORMAT,
	FMT_BYTES,
	FMT_NUMBER,
	QRL_DATA_FORMAT,
	Web3QRLExecutionAPI,
} from '@theqrl/web3-types';
import { qrlRpcMethods } from '@theqrl/web3-rpc-methods';
import { TransactionFactory } from '@theqrl/web3-qrl-accounts';
import {
	BaseWeb3Error,
	InvalidResponseError,
	TransactionError,
	TransactionRevertedWithoutReasonError,
} from '@theqrl/web3-errors';

import { sendSignedTransaction } from '../../../src/rpc_method_wrappers';
import * as WaitForTransactionReceipt from '../../../src/utils/wait_for_transaction_receipt';
import * as WatchTransactionForConfirmations from '../../../src/utils/watch_transaction_for_confirmations';
import {
	expectedTransactionReceipt,
	expectedTransactionHash,
	testData,
} from './fixtures/send_signed_transaction';
import { transactionReceiptSchema } from '../../../src/schemas';

jest.mock('@theqrl/web3-rpc-methods');
jest.mock('../../../src/utils/wait_for_transaction_receipt');
jest.mock('../../../src/utils/watch_transaction_for_confirmations');

// A `null` result is one of the reply shapes under test.
// eslint-disable-next-line no-null/no-null
const NULL_REPLY: unknown = null;

// The hash of a raw transaction is `keccak256` of its bytes; the node has to answer it (P4-L-9).
const localHashOf = (signedTransaction: Bytes) =>
	sha3Raw(format({ format: 'bytes' }, signedTransaction, DEFAULT_RETURN_FORMAT));

describe('sendTransaction', () => {
	const testMessage =
		'Title: %s\ninputSignedTransaction: %s\nexpectedTransactionHash: %s\nexpectedTransactionReceipt: %s\n';

	let web3Context: Web3Context<Web3QRLExecutionAPI>;

	beforeAll(() => {
		web3Context = new Web3Context('http://127.0.0.1:8545');
	});

	beforeEach(() => {
		// The send pipeline checks the node's replies: `qrl_sendRawTransaction` must answer the
		// local hash (P4-L-9) and the block number read by the block-timeout watcher must be a
		// quantity (P4-L-13), so the automocked `undefined` replies need well-formed defaults.
		(qrlRpcMethods.sendRawTransaction as jest.Mock).mockImplementation(
			(_requestManager: unknown, raw: string) => sha3Raw(raw),
		);
		(qrlRpcMethods.getBlockNumber as jest.Mock).mockResolvedValue('0x1');
	});

	afterEach(() => jest.resetAllMocks());

	it.each(testData)(
		`sending event should emit with inputSignedTransaction\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			const inputSignedTransactionFormatted = format(
				{ format: 'bytes' },
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			);
			await sendSignedTransaction(
				web3Context,
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			).on('sending', signedTransaction => {
				expect(signedTransaction).toStrictEqual(inputSignedTransactionFormatted);
			});

			expect.assertions(1);
		},
	);

	it.each(testData)(
		`should call qrlRpcMethods.sendRawTransaction with expected parameters\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			const inputSignedTransactionFormatted = format(
				{ format: 'bytes' },
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			);
			await sendSignedTransaction(web3Context, inputSignedTransaction, DEFAULT_RETURN_FORMAT);
			expect(qrlRpcMethods.sendRawTransaction).toHaveBeenCalledWith(
				web3Context.requestManager,
				inputSignedTransactionFormatted,
			);
		},
	);

	it.each(testData)(
		`sent event should emit with inputSignedTransaction\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			const inputSignedTransactionFormatted = format(
				{ format: 'bytes' },
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			);

			await sendSignedTransaction(
				web3Context,
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			).on('sent', signedTransaction => {
				expect(signedTransaction).toStrictEqual(inputSignedTransactionFormatted);
			});

			expect.assertions(1);
		},
	);

	it.each(testData)(
		`transactionHash event should emit with inputSignedTransaction\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			await sendSignedTransaction(
				web3Context,
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			).on('transactionHash', transactionHash => {
				expect(transactionHash).toStrictEqual(localHashOf(inputSignedTransaction));
			});

			expect.assertions(1);
		},
	);

	it.each(testData)(
		`should call WaitForTransactionReceipt.waitForTransactionReceipt with expected parameters\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			await sendSignedTransaction(web3Context, inputSignedTransaction, DEFAULT_RETURN_FORMAT);
			// The receipt is always awaited in the wire format (H-1), for the local hash (P4-L-9).
			expect(WaitForTransactionReceipt.waitForTransactionReceipt).toHaveBeenCalledWith(
				web3Context,
				localHashOf(inputSignedTransaction),
				QRL_DATA_FORMAT,
			);
		},
	);

	it.each(testData)(
		`waitForTransactionReceipt is called when expected\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			const waitForTransactionReceiptSpy = jest
				.spyOn(WaitForTransactionReceipt, 'waitForTransactionReceipt')
				.mockResolvedValueOnce(expectedTransactionReceipt);

			await sendSignedTransaction(web3Context, inputSignedTransaction, DEFAULT_RETURN_FORMAT);

			expect(waitForTransactionReceiptSpy).toHaveBeenCalledWith(
				web3Context,
				localHashOf(inputSignedTransaction),
				QRL_DATA_FORMAT,
			);
		},
	);

	it.each(testData)(
		`receipt event should emit with inputSignedTransaction\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			const formattedTransactionReceipt = format(
				transactionReceiptSchema,
				expectedTransactionReceipt,
				DEFAULT_RETURN_FORMAT,
			);

			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			await sendSignedTransaction(
				web3Context,
				inputSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			).on('receipt', receiptInfo => {
				expect(receiptInfo).toStrictEqual(formattedTransactionReceipt);
			});

			expect.assertions(1);
		},
	);

	it.each(testData)(
		`should resolve Web3PromiEvent with expectedTransactionReceipt\n ${testMessage}`,
		async (_, inputSignedTransaction) => {
			const formattedTransactionReceipt = format(
				transactionReceiptSchema,
				expectedTransactionReceipt,
				DEFAULT_RETURN_FORMAT,
			);

			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);
			expect(
				await sendSignedTransaction(
					web3Context,
					inputSignedTransaction,
					DEFAULT_RETURN_FORMAT,
				),
			).toStrictEqual(formattedTransactionReceipt);
		},
	);

	it.each(testData)(
		`watchTransactionForConfirmations is called when expected\n ${testMessage}`,
		async (_, inputTransaction) => {
			const watchTransactionForConfirmationsSpy = jest.spyOn(
				WatchTransactionForConfirmations,
				'watchTransactionForConfirmations',
			);
			const formattedTransactionReceipt = format(
				transactionReceiptSchema,
				expectedTransactionReceipt,
				DEFAULT_RETURN_FORMAT,
			);

			(
				WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
			).mockResolvedValueOnce(expectedTransactionReceipt);

			const promiEvent = sendSignedTransaction(
				web3Context,
				inputTransaction,
				DEFAULT_RETURN_FORMAT,
			).on('confirmation', () => undefined);

			await promiEvent;

			// The receipt is always awaited in the wire format (H-1), for the local hash (P4-L-9).
			expect(WaitForTransactionReceipt.waitForTransactionReceipt).toHaveBeenCalledWith(
				web3Context,
				localHashOf(inputTransaction),
				QRL_DATA_FORMAT,
			);
			expect(watchTransactionForConfirmationsSpy).toHaveBeenCalledWith(
				web3Context,
				promiEvent,
				formattedTransactionReceipt,
				localHashOf(inputTransaction),
				DEFAULT_RETURN_FORMAT,
			);
		},
	);

	// Regression harness for audit finding C2: the pre-flight formatting and
	// signed-transaction deserialization used to run outside the executor's
	// try/catch, so a failure there produced an unhandled rejection and a
	// PromiEvent that never settled.
	describe('pre-flight failures (audit finding C2)', () => {
		const NOT_SETTLED = Symbol('NOT_SETTLED');

		// A valid, decodable signed transaction - these tests inject the failure.
		const validSignedTransaction = testData[0][1];

		// Races the PromiEvent against a bounded sentinel, so "never settles" fails
		// the assertion rather than silently blocking until the jest timeout.
		const settleWithin = async (start: () => Promise<unknown>, ms = 250) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				return await Promise.race([
					start().then(
						value => ({ status: 'fulfilled' as const, value, reason: undefined }),
						(reason: unknown) => ({
							status: 'rejected' as const,
							value: undefined,
							reason,
						}),
					),
					new Promise<typeof NOT_SETTLED>(resolve => {
						timer = setTimeout(() => resolve(NOT_SETTLED), ms);
					}),
				]);
			} finally {
				if (timer !== undefined) clearTimeout(timer);
			}
		};

		const countErrorEmits = (emitSpy: jest.SpyInstance) =>
			emitSpy.mock.calls.filter(call => call[0] === 'error').length;

		// Lets any would-be unhandled rejection reach the process handler.
		const flushMacrotasks = async () => {
			for (let i = 0; i < 3; i += 1) {
				// eslint-disable-next-line no-await-in-loop
				await new Promise(resolve => {
					setImmediate(resolve);
				});
			}
		};

		let unhandledRejections: unknown[];
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);

		beforeEach(() => {
			unhandledRejections = [];
			process.on('unhandledRejection', onUnhandledRejection);
		});

		afterEach(() => {
			process.off('unhandledRejection', onUnhandledRejection);
		});

		// Not valid hex - fails in `format` before deserialization is reached.
		const unformattableTransaction = '0xZZ';
		// Valid hex, but not a decodable signed transaction.
		const undeserializableTransaction = '0xdeadbeef';

		it('rejects (rather than hanging) when the pre-flight formatting throws', async () => {
			const outcome = await settleWithin(async () =>
				sendSignedTransaction(
					web3Context,
					unformattableTransaction,
					DEFAULT_RETURN_FORMAT,
				),
			);

			expect(outcome).not.toBe(NOT_SETTLED);
			expect(outcome).toMatchObject({ status: 'rejected' });
			expect((outcome as { reason: unknown }).reason).toBeInstanceOf(Error);
		});

		it('rejects (rather than hanging) when the deserialization throws', async () => {
			const outcome = await settleWithin(async () =>
				sendSignedTransaction(
					web3Context,
					undeserializableTransaction,
					DEFAULT_RETURN_FORMAT,
				),
			);

			expect(outcome).not.toBe(NOT_SETTLED);
			expect(outcome).toMatchObject({ status: 'rejected' });
			expect((outcome as { reason: unknown }).reason).toBeInstanceOf(Error);
		});

		it('emits a wrapped typed error for an unclassified deserialization failure when subscribed (M-7b)', async () => {
			// Every failure reaches an attached listener; one that is not a web3 error is
			// wrapped in a TransactionError. The Promise still rejects with the original.
			const promiEvent = sendSignedTransaction(
				web3Context,
				undeserializableTransaction,
				DEFAULT_RETURN_FORMAT,
			);
			const emitSpy = jest.spyOn(promiEvent, 'emit');
			const errorListener = jest.fn<void, [BaseWeb3Error]>();
			promiEvent.on('error', errorListener);

			const outcome = await settleWithin(async () => promiEvent);
			await flushMacrotasks();

			expect(outcome).not.toBe(NOT_SETTLED);
			expect(outcome).toMatchObject({ status: 'rejected' });
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(errorListener.mock.calls[0][0]).toBeInstanceOf(TransactionError);
			expect(errorListener.mock.calls[0][0].innerError).toBe(
				(outcome as { reason: unknown }).reason,
			);
			expect(countErrorEmits(emitSpy)).toBe(1);
			expect(unhandledRejections).toStrictEqual([]);
		});

		it('emits exactly one error event for a classified deserialization failure when subscribed', async () => {
			const error = new InvalidResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: -32000, message: 'deserialization failed' },
			});
			jest.spyOn(TransactionFactory, 'fromSerializedData').mockImplementation(() => {
				throw error;
			});

			const promiEvent = sendSignedTransaction(
				web3Context,
				validSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			);
			const emitSpy = jest.spyOn(promiEvent, 'emit');
			const errorListener = jest.fn();
			promiEvent.on('error', errorListener);

			const outcome = await settleWithin(async () => promiEvent);
			await flushMacrotasks();

			expect(outcome).not.toBe(NOT_SETTLED);
			expect((outcome as { reason: unknown }).reason).toBe(error);
			expect(errorListener).toHaveBeenCalledTimes(1);
			expect(errorListener).toHaveBeenCalledWith(error);
			expect(countErrorEmits(emitSpy)).toBe(1);
		});

		it('emits no error event for a classified deserialization failure when not subscribed', async () => {
			const error = new InvalidResponseError({
				jsonrpc: '2.0',
				id: 1,
				error: { code: -32000, message: 'deserialization failed' },
			});
			jest.spyOn(TransactionFactory, 'fromSerializedData').mockImplementation(() => {
				throw error;
			});

			const promiEvent = sendSignedTransaction(
				web3Context,
				validSignedTransaction,
				DEFAULT_RETURN_FORMAT,
			);
			const emitSpy = jest.spyOn(promiEvent, 'emit');

			const outcome = await settleWithin(async () => promiEvent);
			await flushMacrotasks();

			expect(outcome).not.toBe(NOT_SETTLED);
			expect((outcome as { reason: unknown }).reason).toBe(error);
			expect(countErrorEmits(emitSpy)).toBe(0);
		});

		it('reports no unhandledRejection for a pre-flight failure', async () => {
			// The caller's `await` is the only consumer; nothing else may leak.
			await expect(
				sendSignedTransaction(
					web3Context,
					undeserializableTransaction,
					DEFAULT_RETURN_FORMAT,
				),
			).rejects.toThrow();
			await flushMacrotasks();

			expect(unhandledRejections).toStrictEqual([]);
		});
	});

	describe('receipt status (H-1)', () => {
		const signedTransaction = testData[0][1];
		const options = { checkRevertBeforeSending: false };
		const formats: [string, DataFormat][] = [
			['BIGINT/HEX', { number: FMT_NUMBER.BIGINT, bytes: FMT_BYTES.HEX }],
			['HEX/HEX', { number: FMT_NUMBER.HEX, bytes: FMT_BYTES.HEX }],
			['NUMBER/HEX', { number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.HEX }],
			['STR/HEX', { number: FMT_NUMBER.STR, bytes: FMT_BYTES.HEX }],
			['BIGINT/UINT8ARRAY', { number: FMT_NUMBER.BIGINT, bytes: FMT_BYTES.UINT8ARRAY }],
		];
		const failing: [string, unknown][] = [
			["'0x0'", '0x0'],
			["'0'", '0'],
			['0 (number)', 0],
			['missing', undefined],
			// eslint-disable-next-line no-null/no-null
			['null', null],
			['true', true],
			["'0x'", '0x'],
			["'abc'", 'abc'],
		];
		const succeeding: [string, unknown][] = [
			["'0x1'", '0x1'],
			["'0x01'", '0x01'],
			['1 (number)', 1],
		];

		const receiptWithStatus = (status: unknown) => {
			const receipt: Record<string, unknown> = { ...expectedTransactionReceipt, status };
			if (status === undefined) delete receipt.status;
			return receipt;
		};

		describe.each(formats)('with returnFormat %s', (_, returnFormat) => {
			it.each(failing)('rejects a receipt whose status is %s', async (__, status) => {
				(
					WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
				).mockResolvedValueOnce(receiptWithStatus(status));

				await expect(
					sendSignedTransaction(web3Context, signedTransaction, returnFormat, options),
				).rejects.toThrow(TransactionRevertedWithoutReasonError);
			});

			it.each(succeeding)('resolves a receipt whose status is %s', async (__, status) => {
				(
					WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock
				).mockResolvedValueOnce(receiptWithStatus(status));

				const receipt = await sendSignedTransaction(
					web3Context,
					signedTransaction,
					returnFormat,
					options,
				);
				expect(receipt.transactionHash).toStrictEqual(
					format(
						{ format: 'bytes32' },
						expectedTransactionReceipt.transactionHash,
						returnFormat,
					),
				);
				expect(receipt.status).toStrictEqual(format({ format: 'uint' }, 1, returnFormat));
			});
		});
	});

	describe('transaction hash reply (P4-L-9)', () => {
		const signedTransaction = testData[0][1];
		const options = { checkRevertBeforeSending: false };

		it.each([
			['a different 32-byte hash', expectedTransactionHash],
			['the all-0xee hash of the PoC', `0x${'ee'.repeat(32)}`],
			["'abc'", 'abc'],
			['a 20-byte value', `0x${'ab'.repeat(20)}`],
			['null', NULL_REPLY],
			['an object', {}],
		])(
			'rejects %s as the qrl_sendRawTransaction reply before waiting for a receipt',
			async (_, reply) => {
				(qrlRpcMethods.sendRawTransaction as jest.Mock).mockResolvedValueOnce(reply);

				await expect(
					sendSignedTransaction(
						web3Context,
						signedTransaction,
						DEFAULT_RETURN_FORMAT,
						options,
					),
				).rejects.toThrow(InvalidResponseError);
				expect(WaitForTransactionReceipt.waitForTransactionReceipt).not.toHaveBeenCalled();
			},
		);

		it('accepts the local hash in upper case and continues with the local spelling', async () => {
			const localHash = localHashOf(signedTransaction);
			(qrlRpcMethods.sendRawTransaction as jest.Mock).mockResolvedValueOnce(
				`0x${localHash.slice(2).toUpperCase()}`,
			);
			(WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock).mockResolvedValueOnce(
				expectedTransactionReceipt,
			);
			const emittedHashes: unknown[] = [];

			await sendSignedTransaction(
				web3Context,
				signedTransaction,
				DEFAULT_RETURN_FORMAT,
				options,
			).on('transactionHash', hash => {
				emittedHashes.push(hash);
			});

			expect(emittedHashes).toStrictEqual([localHash]);
			expect(WaitForTransactionReceipt.waitForTransactionReceipt).toHaveBeenCalledWith(
				web3Context,
				localHash,
				QRL_DATA_FORMAT,
			);
		});
	});

	describe('listener exceptions (P4-L-10)', () => {
		const signedTransaction = testData[0][1];
		const options = { checkRevertBeforeSending: false };

		it('still resolves with the receipt when a receipt listener throws after the broadcast', async () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			(WaitForTransactionReceipt.waitForTransactionReceipt as jest.Mock).mockResolvedValueOnce(
				expectedTransactionReceipt,
			);
			const promiEvent = sendSignedTransaction(
				web3Context,
				signedTransaction,
				DEFAULT_RETURN_FORMAT,
				options,
			);
			promiEvent.on('receipt', () => {
				throw new Error('receipt listener boom');
			});

			await expect(promiEvent).resolves.toStrictEqual(
				format(transactionReceiptSchema, expectedTransactionReceipt, DEFAULT_RETURN_FORMAT),
			);
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it('rejects, instead of staying pending, when the error listener throws', async () => {
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
			const promiEvent = sendSignedTransaction(
				web3Context,
				'0xdeadbeef',
				DEFAULT_RETURN_FORMAT,
				options,
			);
			promiEvent.on('error', () => {
				throw new Error('listener boom');
			});

			await expect(promiEvent).rejects.toThrow();
			expect(warn).toHaveBeenCalledTimes(1);
		});
	});
});
