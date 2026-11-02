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

jest.unmock('isomorphic-ws');
import { AddressInfo, Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { Web3RequestManager, Web3SubscriptionManager, Web3Subscription } from '../../src';
import { JsonRpcNotification, JsonRpcRequest } from '@theqrl/web3-types';
import { Web3DeferredPromise } from '@theqrl/web3-utils';
import WebSocketProvider from '@theqrl/web3-providers-ws';

class Heads extends Web3Subscription<{ data: unknown }> {
	// eslint-disable-next-line class-methods-use-this -- abstract subscription override
	protected _buildSubscriptionParams(): ['newHeads'] {
		return ['newHeads'];
	}
}
const tick = async () => new Promise<void>(resolve => setTimeout(resolve, 5));
const until = async (check: () => boolean, description = 'test connection') => {
	const deadline = Date.now() + 2000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
		// eslint-disable-next-line no-await-in-loop
		await tick();
	}
};

const setup = async (
	failHandshake = false,
	coalesced: boolean | number = false,
	dropUnsubscribe = false,
	delayRequest = false,
) => {
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	await new Promise<void>(resolve => server.once('listening', resolve));
	let connections = 0;
	let counter = 0;
	let holdAccounts = false;
	let rejectProbes = failHandshake;
	const pendingAccounts: (() => void)[] = [];
	const live = new Map<WebSocket, Set<string>>();
	const requests: { connection: number; method: string }[] = [];
	server.on('connection', socket => {
		const connection = ++connections;
		const ids = new Set<string>();
		live.set(socket, ids);
		socket.on('close', () => live.delete(socket));
		socket.on('message', raw => {
			const request = JSON.parse((raw as Buffer).toString()) as JsonRpcRequest;
			requests.push({ connection, method: request.method });
			const reply = (result: unknown) =>
				socket.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
			if (request.method === 'qrl_accounts' && holdAccounts) {
				pendingAccounts.push(() => reply([]));
			} else if (
				(request.method === 'qrl_accounts' || request.method === 'qrl_chainId') &&
				rejectProbes
			) {
				socket.send(
					JSON.stringify({
						jsonrpc: '2.0',
						id: request.id,
						error: { code: -32601, message: 'method unavailable' },
					}),
				);
			} else if (request.method === 'qrl_subscribe') {
				const id = `0x${++counter}`;
				ids.add(id);
				for (const release of pendingAccounts.splice(0)) release();
				setImmediate(() => {
					const wire = (socket as unknown as { _socket: Socket })._socket;
					wire.cork();
					reply(id);
					for (
						let i = 0;
						i < (typeof coalesced === 'number' ? coalesced : Number(coalesced));
						i += 1
					)
						socket.send(
							JSON.stringify({
								jsonrpc: '2.0',
								method: 'qrl_subscription',
								params: {
									subscription: id,
									result:
										typeof coalesced === 'number'
											? `${id}:${i}`
											: `first-${id}`,
								},
							}),
						);
					wire.uncork();
				});
			} else if (request.method === 'qrl_unsubscribe') {
				if (dropUnsubscribe) socket.terminate();
				else reply(ids.delete((request.params as string[])[0]));
			} else reply(request.method === 'qrl_accounts' ? ['0xaa'] : '0x1');
		});
	});
	const provider = new WebSocketProvider(
		`ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
		{},
		{ autoReconnect: true, delay: 50 },
		{ requestTimeout: 1000 },
	);
	if (delayRequest) {
		const request = provider.request.bind(provider);
		jest.spyOn(provider, 'request').mockImplementation(async payload => {
			const result = await request(payload);
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			return result;
		});
	}

	const errors = jest.fn();
	provider.on('error', errors);
	const manager = new Web3SubscriptionManager(new Web3RequestManager(provider), { heads: Heads });
	return {
		provider,
		manager,
		server,
		live,
		requests,
		errors,
		holdAccounts: () => {
			holdAccounts = true;
		},
		connections: () => connections,
		setRejectProbes: (value: boolean) => {
			rejectProbes = value;
		},
		close: async () => {
			manager.dispose();
			provider.disconnect();
			for (const socket of server.clients) socket.terminate();
			await new Promise<void>(resolve => server.close(() => resolve()));
		},
	};
};

test('registers once during the initial RPC handshake', async () => {
	const test = await setup();
	test.holdAccounts();
	try {
		await test.provider.request({
			jsonrpc: '2.0',
			id: 90,
			method: 'qrl_blockNumber',
			params: [],
		});
		const sub = await test.manager.subscribe('heads');
		expect(test.requests.filter(request => request.method === 'qrl_subscribe')).toHaveLength(1);
		expect(test.manager.subscriptions.get(sub.id!)).toBe(sub);
		await sub.unsubscribe();
		expect([...test.live.values()].flatMap(ids => [...ids])).toEqual([]);
	} finally {
		await test.close();
	}
});

test('retries an initial subscription queued during reconnect without leaking registrations', async () => {
	const test = await setup();
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		const first = await test.manager.subscribe('heads');
		for (const socket of test.server.clients) socket.terminate();
		await until(() => test.provider.getStatus() === 'disconnected');
		const second = await test.manager.subscribe('heads');
		await until(() => test.manager.subscriptions.size === 2 && first.id !== '0x1');
		expect(test.manager.subscriptions.get(second.id!)).toBe(second);
		await until(() => [...test.live.values()].flatMap(ids => [...ids]).length === 2);
		expect(
			test.requests.filter(
				request => request.connection === 2 && request.method === 'qrl_subscribe',
			),
		).toHaveLength(3);
		await first.unsubscribe();
		await second.unsubscribe();
		await until(() => [...test.live.values()].every(ids => ids.size === 0));
		expect(test.manager.subscriptions.size).toBe(0);
	} finally {
		await test.close();
	}
});

test('recovers live subscriptions when a gateway rejects qrl_accounts', async () => {
	const test = await setup(true);
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		const sub = await test.manager.subscribe('heads');
		const oldId = sub.id;
		for (const socket of test.server.clients) socket.terminate();
		await until(() => test.connections() === 2 && sub.id !== oldId && sub.id !== undefined);
		expect(test.errors).toHaveBeenCalledTimes(4);
		expect(test.manager.subscriptions.get(sub.id!)).toBe(sub);
		await sub.unsubscribe();
	} finally {
		await test.close();
	}
});

test('manual connect cancels the reconnect timer and sends requests immediately', async () => {
	const test = await setup();
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		for (const socket of test.server.clients) socket.terminate();
		await until(() => test.provider.getStatus() === 'disconnected');
		const ready = new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		test.provider.connect();
		await ready;
		await expect(
			test.provider.request({
				jsonrpc: '2.0',
				id: 91,
				method: 'qrl_blockNumber',
				params: [],
			}),
		).resolves.toHaveProperty('result', '0x1');
		await new Promise<void>(resolve => setTimeout(resolve, 100));
		expect(test.connections()).toBe(2);
	} finally {
		await test.close();
	}
});

test('keeps known chain and accounts and reconnects even when a probe error listener throws', async () => {
	const test = await setup();
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		const sub = await test.manager.subscribe('heads');
		const chainChanged = jest.fn();
		const accountsChanged = jest.fn();
		const connected = jest.fn();
		test.provider.on('chainChanged', chainChanged);
		test.provider.on('accountsChanged', accountsChanged);
		test.provider.on('connect', connected);
		test.provider.on('error', () => {
			throw new Error('consumer error listener');
		});
		test.setRejectProbes(true);
		for (const socket of test.server.clients) socket.terminate();
		await until(() => connected.mock.calls.length === 1 && sub.id !== '0x1');
		expect(test.provider.isConnected()).toBe(true);
		expect(connected).toHaveBeenLastCalledWith({ chainId: '0x1' });
		test.setRejectProbes(false);
		for (const socket of test.server.clients) socket.terminate();
		await until(() => connected.mock.calls.length === 2);
		expect(chainChanged).not.toHaveBeenCalled();
		expect(accountsChanged).not.toHaveBeenCalled();
	} finally {
		await test.close();
	}
});

test('delivers coalesced first WS notifications after initial and recovery registration', async () => {
	const test = await setup(false, true);
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		const sub = await test.manager.subscribe('heads');
		const data = jest.fn<void, [unknown]>();
		sub.on('data', data);
		await until(() => data.mock.calls.length === 1);
		for (const socket of test.server.clients) socket.terminate();
		await until(() => data.mock.calls.length === 2);
		expect(data.mock.calls).toEqual([['first-0x1'], ['first-0x2']]);
		await sub.unsubscribe();
	} finally {
		await test.close();
	}
});

test('contains throwing provider callbacks and keeps receiver and recovery live', async () => {
	const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	const test = await setup();
	try {
		for (const event of [
			'connect',
			'disconnect',
			'chainChanged',
			'accountsChanged',
			'message',
			'error',
		] as const) {
			test.provider.on(event, () => {
				throw new Error(`consumer ${event}`);
			});
		}
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		expect(test.provider.isConnected()).toBe(true);
		const sub = await test.manager.subscribe('heads');
		for (const socket of test.server.clients) socket.send('null');
		await expect(
			test.provider.request({
				jsonrpc: '2.0',
				id: 999,
				method: 'qrl_blockNumber',
				params: [],
			}),
		).resolves.toHaveProperty('result', '0x1');
		for (const socket of test.server.clients) socket.terminate();
		await until(() => sub.id === '0x2');
		expect(test.manager.subscriptions.get('0x2')).toBe(sub);
		expect(() => test.provider.disconnect()).not.toThrow();
	} finally {
		await test.close();
		warn.mockRestore();
	}
});

test('treats an unsubscribe written before connection loss as completed local removal', async () => {
	const test = await setup(false, false, true);
	try {
		await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
		const sub = await test.manager.subscribe('heads');
		await expect(sub.unsubscribe()).resolves.toBeUndefined();
		expect(sub.id).toBeUndefined();
		expect(test.manager.subscriptions.size).toBe(0);
	} finally {
		await test.close();
	}
});

// This must exercise the wire: a mock that awaits registration between items misses the race.
test.each([false, true])(
	'delivers 300 coalesced WS items after registration (delayed wrapper=%s)',
	async delayRequest => {
		const test = await setup(false, 300, false, delayRequest);
		try {
			await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
			const sub = await test.manager.subscribe('heads');
			const data = jest.fn<void, [unknown]>();
			const errors = jest.fn();
			sub.on('data', data);
			test.manager.on('error', errors);
			await until(() => data.mock.calls.length === 300);
			for (const socket of test.server.clients) socket.terminate();
			await until(() => data.mock.calls.length === 600);
			expect(data.mock.calls.map(([value]) => value)).toEqual(
				['0x1', '0x2'].flatMap(id => Array.from({ length: 300 }, (_, i) => `${id}:${i}`)),
			);
			expect(errors).not.toHaveBeenCalled();
			await sub.unsubscribe();
		} finally {
			await test.close();
		}
	},
);

test.each([
	[0, 60],
	[100, 60],
	[200, 60],
	[200, 150],
])(
	'keeps the unknown-id budget after an acknowledged burst of %s and tail of %s',
	async (burst, tail) => {
		const test = await setup(false, burst);
		const retained = Math.min(tail, 128);
		const registrationGate = new Web3DeferredPromise<void>();
		let subscription: Promise<Heads> | undefined;
		try {
			await new Promise<void>(resolve => test.provider.once('connect', () => resolve()));
			const errors = jest.fn();
			test.manager.on('error', errors);
			let replyReceived = false;
			const request = test.provider.request.bind(test.provider);
			jest.spyOn(test.provider, 'request').mockImplementation(async payload => {
				const result = await request(payload);
				if (payload.method === 'qrl_subscribe') {
					replyReceived = true;
					await registrationGate;
				}
				return result;
			});
			const received: JsonRpcNotification[] = [];
			test.provider.on('message', message => {
				const notification = message as unknown as JsonRpcNotification;
				if (notification.params?.subscription === '0x1') received.push(notification);
			});
			subscription = test.manager.subscribe('heads');
			// Keep registration pending until the provider has flushed the acknowledged
			// burst and processed the entire unacknowledged tail. Timer gaps cannot
			// establish this ordering when the CI runner or socket delivery is delayed.
			await until(
				() =>
					replyReceived &&
					received.length >= burst &&
					!test.provider.isSubscriptionAcknowledged('0x1'),
				'acknowledged burst to finish',
			);
			expect(received).toHaveLength(burst);
			expect(test.server.clients.size).toBe(1);
			for (const socket of test.server.clients) {
				for (let i = 0; i < tail; i += 1)
					socket.send(
						JSON.stringify({
							jsonrpc: '2.0',
							method: 'qrl_subscription',
							params: { subscription: '0x1', result: `0x1:tail:${i}` },
						}),
					);
			}
			await until(() => received.length >= burst + tail, 'tail to reach the provider');
			expect(test.manager.subscriptions.size).toBe(0);
			expect(errors).toHaveBeenCalledTimes(tail - retained);
			registrationGate.resolve();
			const sub = await subscription;
			const data = jest.fn<void, [unknown]>();
			sub.on('data', data);
			await until(
				() => data.mock.calls.length >= burst + retained,
				'retained notifications to reach the subscription',
			);
			expect(data.mock.calls.map(([value]) => value)).toEqual([
				...Array.from({ length: burst }, (_, i) => `0x1:${i}`),
				...Array.from({ length: retained }, (_, i) => `0x1:tail:${i}`),
			]);
			expect(errors).toHaveBeenCalledTimes(tail - retained);
			await sub.unsubscribe();
		} finally {
			registrationGate.resolve();
			await subscription?.catch(() => undefined);
			await test.close();
		}
	},
);
