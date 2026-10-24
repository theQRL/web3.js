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
import { AddressInfo } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { Web3RequestManager, Web3SubscriptionManager, Web3Subscription } from '../../src';
import { JsonRpcRequest } from '@theqrl/web3-types';
import WebSocketProvider from '@theqrl/web3-providers-ws';

class Heads extends Web3Subscription<{ data: unknown }> {
	// eslint-disable-next-line class-methods-use-this -- abstract subscription override
	protected _buildSubscriptionParams(): ['newHeads'] {
		return ['newHeads'];
	}
}
const tick = async () => new Promise<void>(resolve => setTimeout(resolve, 5));
const until = async (check: () => boolean) => {
	const deadline = Date.now() + 2000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error('Timed out waiting for test connection');
		// eslint-disable-next-line no-await-in-loop
		await tick();
	}
};

const setup = async (failHandshake = false) => {
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	await new Promise<void>(resolve => server.once('listening', resolve));
	let connections = 0;
	let counter = 0;
	let holdAccounts = false;
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
			} else if (request.method === 'qrl_accounts' && failHandshake) {
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
				setImmediate(() => reply(id));
			} else if (request.method === 'qrl_unsubscribe') {
				reply(ids.delete((request.params as string[])[0]));
			} else reply(request.method === 'qrl_accounts' ? [] : '0x1');
		});
	});
	const provider = new WebSocketProvider(
		`ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
		{},
		{ autoReconnect: true, delay: 50 },
		{ requestTimeout: 1000 },
	);
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
		expect(test.errors).toHaveBeenCalledTimes(2);
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
