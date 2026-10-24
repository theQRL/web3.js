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

import { format, SocketProvider } from '@theqrl/web3-utils';
import {
	create as _createAccount,
	decrypt,
	seedToAccount,
	signTransaction,
} from '@theqrl/web3-qrl-accounts';

import { prepareTransactionForSigning, Web3QRL } from '@theqrl/web3-qrl';
import { Web3Context } from '@theqrl/web3-core';

import {
	QRLExecutionAPI,
	Bytes,
	Web3BaseProvider,
	Transaction,
	KeyStore,
	ProviderConnectInfo,
	Web3ProviderEventCallback,
	ProviderRpcError,
	JsonRpcSubscriptionResult,
	JsonRpcNotification,
	QRL_DATA_FORMAT,
	SupportedProviders,
	TransactionReceipt,
	Web3APISpec,
	Web3QRLExecutionAPI,
} from '@theqrl/web3-types';
import HttpProvider from '@theqrl/web3-providers-http';
import { IpcProvider } from '@theqrl/web3-providers-ipc';
import accountsString from './accounts.json';

// Avoid an eager type-only import of the umbrella '@theqrl/web3' package: it depends on
// '@theqrl/web3-qrl', so it can't be a dependency of web3-qrl, and turbo therefore doesn't
// guarantee its lib outputs exist when unit tests pull this file in via fixture symlinks.
// The runtime require below is lazy and only reached from integration-style helpers.
type Web3 = any;

type NonPayableMethodObject = {
	encodeABI: () => string;
};

/**
 * Get the env variable from Cypress if it exists or node process
 */
export const getEnvVar = (name: string): string | undefined =>
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-expect-error
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
	global.Cypress ? Cypress.env(name) : process.env[name];

export const DEFAULT_SYSTEM_PROVIDER = 'http://127.0.0.1:8545';
export const DEFAULT_SYSTEM_ENGINE = 'node';

export const getSystemTestProviderUrl = (): string =>
	getEnvVar('WEB3_SYSTEM_TEST_PROVIDER') ?? DEFAULT_SYSTEM_PROVIDER;

export const getSystemTestProvider = <API extends Web3APISpec = Web3QRLExecutionAPI>():
	| string
	| SupportedProviders<API> => {
	const url = getSystemTestProviderUrl();
	if (url.includes('ipc')) {
		return new IpcProvider<API>(url);
	}
	return url;
};

export const getSystemTestEngine = (): string =>
	getEnvVar('WEB3_SYSTEM_TEST_ENGINE') ?? DEFAULT_SYSTEM_ENGINE;

export const isHttp: boolean = getSystemTestProviderUrl().startsWith('http');
export const isWs: boolean = getSystemTestProviderUrl().startsWith('ws');
export const isIpc: boolean = getSystemTestProviderUrl().includes('ipc');
export const isChrome: boolean = getSystemTestEngine() === 'chrome';
export const isFirefox: boolean = getSystemTestEngine() === 'firefox';
export const isElectron: boolean = getSystemTestEngine() === 'electron';
export const isNode: boolean = getSystemTestEngine() === 'isNode';
export const isSyncTest: boolean = getEnvVar('TEST_OPTION') === 'sync';
export const isSocket: boolean = isWs || isIpc;
export const isBrowser: boolean = ['chrome', 'firefox'].includes(getSystemTestEngine());

export const getSystemTestMnemonic = (): string => getEnvVar('WEB3_SYSTEM_TEST_MNEMONIC') ?? '';

export const getSystemTestBackend = (): string => getEnvVar('WEB3_SYSTEM_TEST_BACKEND') ?? '';

export const createAccount = _createAccount;

export const itIf = (condition: (() => boolean) | boolean) =>
	(typeof condition === 'function' ? condition() : condition) ? test : test.skip;

export const describeIf = (condition: (() => boolean) | boolean) =>
	(typeof condition === 'function' ? condition() : condition) ? describe : describe.skip;

const maxNumberOfAttempts = 100;
const intervalTime = 500; // ms

export const waitForOpenConnection = async (
	web3Context: Web3Context,
	currentAttempt = 1,
	status = 'connected',
) =>
	new Promise<void>((resolve, reject) => {
		if (!isSocket) {
			resolve();
			return;
		}

		const interval = setInterval(() => {
			if (currentAttempt > maxNumberOfAttempts - 1) {
				clearInterval(interval);
				reject(new Error('Maximum number of attempts exceeded'));
			} else if (
				(web3Context.provider as unknown as Web3BaseProvider).getStatus() === status
			) {
				clearInterval(interval);
				resolve();
			}
			currentAttempt++;
		}, intervalTime);
	});

export const closeOpenConnection = async (web3Context: Web3Context) => {
	if (!isSocket || web3Context?.provider instanceof HttpProvider) {
		return;
	}

	// make sure we try to close the connection after it is established
	if (
		web3Context?.provider &&
		(web3Context.provider as unknown as Web3BaseProvider).getStatus() === 'connecting'
	) {
		await waitForOpenConnection(web3Context);
	}

	// If an error happened during closing, that is acceptable at tests, just print a 'warn'.
	if (web3Context?.provider) {
		(web3Context.provider as unknown as Web3BaseProvider).on('error', (err: any) => {
			console.warn('error while trying to close the connection', err);
		});
	}

	// Wait a bit to ensure the connection does not have a pending data that
	//	could cause an error if written after closing the connection.
	await new Promise<void>(resolve => {
		setTimeout(resolve, 500);
	});

	if (
		web3Context?.provider &&
		'disconnect' in (web3Context.provider as unknown as Web3BaseProvider)
	) {
		(web3Context.provider as unknown as Web3BaseProvider).disconnect(1000, '');
	}
};

export const createAccountProvider = (context: Web3Context<QRLExecutionAPI>) => {
	const signTransactionWithContext = async (transaction: Transaction, seed: Bytes) => {
		const tx = await prepareTransactionForSigning(transaction, context);

		const seedBytes = format({ format: 'bytes' }, seed, QRL_DATA_FORMAT);

		return signTransaction(tx, seedBytes);
	};

	const seedToAccountWithContext = (seed: Uint8Array | string) => {
		const account = seedToAccount(seed);

		return {
			...account,
			signTransaction: async (transaction: Transaction) =>
				signTransactionWithContext(transaction, account.seed),
		};
	};

	const decryptWithContext = async (
		keystore: string | KeyStore,
		password: string,
		options?: Record<string, unknown>,
	) => {
		const account = await decrypt(keystore, password, (options?.nonStrict as boolean) ?? true);

		return {
			...account,
			signTransaction: async (transaction: Transaction) =>
				signTransactionWithContext(transaction, account.seed),
		};
	};

	const createWithContext = () => {
		const account = _createAccount();

		return {
			...account,
			signTransaction: async (transaction: Transaction) =>
				signTransactionWithContext(transaction, account.seed),
		};
	};

	return {
		create: createWithContext,
		seedToAccount: seedToAccountWithContext,
		decrypt: decryptWithContext,
	};
};

export const refillAccount = async (from: string, to: string, value: string | number) => {
	const web3QRL = new Web3QRL(getSystemTestProviderUrl());

	await web3QRL.sendTransaction({
		from,
		to,
		value,
	});
};

let mainAcc: string;
export const createNewAccount = async (config?: {
	refill?: boolean;
	seed?: string;
}): Promise<{ address: string; seed: string }> => {
	const acc = config?.seed ? seedToAccount(config?.seed) : _createAccount();

	const clientUrl = getSystemTestProviderUrl();

	if (config?.refill) {
		const web3QRL = new Web3QRL(clientUrl);
		if (!mainAcc) {
			[mainAcc] = await web3QRL.getAccounts();
		}
		await refillAccount(mainAcc, acc.address, '10000000000000000000');
	}

	return { address: `Q${acc.address.slice(1).toLowerCase()}`, seed: acc.seed };
};
let tempAccountList: { address: string; seed: string }[] = [];
const walletsOnWorker = 20;

if (tempAccountList.length === 0) {
	tempAccountList = accountsString;
}
let currentIndex = Math.floor(Math.random() * tempAccountList.length);
export const createTempAccount = async (
	config: {
		refill?: boolean;
		seed?: string;
		password?: string;
	} = {},
): Promise<{ address: string; seed: string }> => {
	if ((typeof config.refill === 'boolean' && !config.refill) || config.seed || config.password) {
		return createNewAccount({
			refill: config.refill ?? true,
			seed: config.seed,
		});
	}

	if (currentIndex >= walletsOnWorker || !tempAccountList[currentIndex]) {
		currentIndex = 0;
	}

	const acc = tempAccountList[currentIndex];
	await createNewAccount({
		refill: false,
		seed: acc.seed,
	});
	currentIndex += 1;

	return acc;
};

export const getSystemTestAccountsWithKeys = async (): Promise<
	{
		address: string;
		seed: string;
	}[]
> => {
	const acc = await createTempAccount();
	const acc2 = await createTempAccount();
	const acc3 = await createTempAccount();
	return [acc, acc2, acc3];
};

export const getSystemTestAccounts = async (): Promise<string[]> =>
	(await getSystemTestAccountsWithKeys()).map(a => a.address);

type Web3Constructor = new (provider: SupportedProviders) => Web3;

const createWeb3 = (provider: unknown): Web3 => {
	// Load the umbrella package only in helpers that need it. Some unit tests import this
	// fixture for account helpers, and eager loading races Turbo's package build outputs.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Web3Ctor = (require('@theqrl/web3') as { default: Web3Constructor }).default;
	return new Web3Ctor(provider as SupportedProviders);
};

export const signTxAndSendEIP1559 = async (provider: unknown, tx: Transaction, seed: string) => {
	const web3 = createWeb3(provider);
	const acc = web3.qrl.accounts.seedToAccount(seed);
	web3.qrl.wallet?.add(seed);

	const txObj = {
		...tx,
		type: '0x2',
		gas: tx.gas ?? '1000000',
		from: acc.address,
	};

	return web3.qrl.sendTransaction(txObj, undefined, { checkRevertBeforeSending: false });
};

export const signAndSendContractMethodEIP1559 = async (
	provider: unknown,
	address: string,
	method: NonPayableMethodObject,
	seed: string,
) =>
	signTxAndSendEIP1559(
		provider,
		{
			to: address,
			data: method.encodeABI(),
		},
		seed,
	);

export const createLocalAccount = async (web3: ReturnType<typeof createWeb3>) => {
	const account = web3.qrl.accounts.create();
	await refillAccount(
		(
			await createTempAccount()
		).address,
		account.address,
		'100000000000000000000',
	);
	web3.qrl.accounts.wallet.add(account);
	return account;
};
/* eslint-disable @typescript-eslint/no-unsafe-call */
const socketWaitTimeoutMs = 5_000;
const socketPollIntervalMs = 50;

const waitForSocketStatus = async <ResultType>(
	provider: SocketProvider<any, any, any>,
	expectedStatus: 'connected' | 'disconnected',
	eventName: 'connect' | 'disconnect',
	defaultResult: ResultType,
) => {
	if (provider.getStatus() === expectedStatus) {
		return defaultResult;
	}

	return new Promise<ResultType>((resolve, reject) => {
		let statusInterval: ReturnType<typeof setInterval>;
		let timeoutHandle: ReturnType<typeof setTimeout>;
		let eventHandler: Web3ProviderEventCallback<ResultType>;

		const cleanup = () => {
			clearInterval(statusInterval);
			clearTimeout(timeoutHandle);
			provider.removeListener(eventName, eventHandler);
		};

		eventHandler = ((
			_error: Error | ProviderRpcError | undefined,
			data?: JsonRpcSubscriptionResult | JsonRpcNotification<ResultType>,
		) => {
			cleanup();
			resolve((data as unknown as ResultType) ?? defaultResult);
		}) as Web3ProviderEventCallback<ResultType>;

		statusInterval = setInterval(() => {
			if (provider.getStatus() === expectedStatus) {
				cleanup();
				resolve(defaultResult);
			}
		}, socketPollIntervalMs);

		timeoutHandle = setTimeout(() => {
			cleanup();
			reject(new Error(`Timeout waiting for socket status "${expectedStatus}".`));
		}, socketWaitTimeoutMs);

		provider.on(eventName, eventHandler);
	});
};

export const waitForSocketConnect = async (provider: SocketProvider<any, any, any>) =>
	waitForSocketStatus(
		provider,
		'connected',
		'connect',
		{} as ProviderConnectInfo,
	);

export const waitForSocketDisconnect = async (provider: SocketProvider<any, any, any>) =>
	waitForSocketStatus(
		provider,
		'disconnected',
		'disconnect',
		{ code: 1000, message: '' } as ProviderRpcError,
	);

export const waitForOpenSocketConnection = async (provider: SocketProvider<any, any, any>) =>
	waitForSocketConnect(provider);

export const waitForCloseSocketConnection = async (provider: SocketProvider<any, any, any>) =>
	waitForSocketDisconnect(provider);

export const waitForEvent = async (
	web3Provider: SocketProvider<any, any, any>,
	eventName: string,
) =>
	new Promise(resolve => {
		web3Provider.on(eventName, (data: any) => {
			resolve(data);
		});
	});

export const sendFewSampleTxs = async (cnt = 1) => {
	const web3 = createWeb3(getSystemTestProviderUrl());
	const fromAcc = await createLocalAccount(web3);
	const toAcc = createAccount();
	const res: TransactionReceipt[] = [];
	for (let i = 0; i < cnt; i += 1) {
		// eslint-disable-next-line no-await-in-loop
		const receipt = await web3.qrl.sendTransaction({
			to: toAcc.address,
			value: '0x1',
			from: fromAcc.address,
			gas: '300000',
		});

		if (receipt.status !== BigInt(1)) throw new Error('sendFewSampleTxs failed ');

		res.push(receipt);
	}
	await closeOpenConnection(web3 as unknown as Web3Context);
	return res;
};

export const objectBigintToString = (obj: object): object =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	JSON.parse(
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
	);
