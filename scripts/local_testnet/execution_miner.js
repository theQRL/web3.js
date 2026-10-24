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

/* eslint-disable no-await-in-loop -- Payload production and fork choice must run sequentially. */
/* eslint-disable no-null/no-null -- Engine API uses an explicit null payload-attributes parameter. */

// Drive the published go-qrl Engine API with simulated fork choice (no consensus client).
const { createHmac, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');
const secret = Buffer.from(
	readFileSync(require('node:path').join(process.argv[2], 'jwt.hex'), 'utf8').trim(),
	'hex',
);
let id = 0;
let stopped = false;
process.on('SIGINT', () => {
	stopped = true;
});
process.on('SIGTERM', () => {
	stopped = true;
});
const token = () => {
	const input = [
		JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
		JSON.stringify({ iat: Math.floor(Date.now() / 1000) }),
	]
		.map(s => Buffer.from(s).toString('base64url'))
		.join('.');
	return input + '.' + createHmac('sha256', secret).update(input).digest('base64url');
};
async function rpc(method, params, engine = false) {
	const res = await fetch(engine ? 'http://127.0.0.1:18551' : 'http://127.0.0.1:18545', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(engine ? { Authorization: 'Bearer ' + token() } : {}),
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
		signal: AbortSignal.timeout(30000),
	});
	const reply = await res.json();
	if (reply.error) throw new Error(method + ': ' + JSON.stringify(reply.error));
	return reply.result;
}
async function main() {
	let head;
	for (let attempt = 0; attempt < 60 && !stopped; attempt += 1) {
		try {
			head = await rpc('qrl_getBlockByNumber', ['latest', false]);
			break;
		} catch (error) {
			if (attempt === 59) throw error;
			await sleep(1000);
		}
	}
	if (stopped) return;
	const accounts = await rpc('qrl_accounts', []);
	const state = {
		headBlockHash: head.hash,
		safeBlockHash: head.hash,
		finalizedBlockHash: head.hash,
	};
	await rpc('engine_forkchoiceUpdatedV2', [state, null], true);
	console.info(
		'Ready: ' +
			(await rpc('web3_clientVersion', [])) +
			'; ' +
			accounts.length +
			' signer accounts; chain ' +
			(await rpc('qrl_chainId', [])),
	);
	while (!stopped) {
		const timestamp = Math.max(
			Math.floor(Date.now() / 1000),
			Number(BigInt(head.timestamp)) + 1,
		);
		const built = await rpc(
			'engine_forkchoiceUpdatedV2',
			[
				state,
				{
					timestamp: '0x' + timestamp.toString(16),
					prevRandao: '0x' + randomBytes(32).toString('hex'),
					suggestedFeeRecipient: accounts[0],
					withdrawals: [],
				},
			],
			true,
		);
		if (!built.payloadId) throw new Error('No payload: ' + JSON.stringify(built));
		await sleep(150);
		const result = await rpc('engine_getPayloadV2', [built.payloadId], true);
		const payload = result.executionPayload;
		const checked = await rpc('engine_newPayloadV2', [payload], true);
		if (checked.status !== 'VALID')
			throw new Error('Rejected block: ' + JSON.stringify(checked));
		state.headBlockHash = payload.blockHash;
		state.safeBlockHash = payload.blockHash;
		if (BigInt(payload.blockNumber) % 32n === 0n) state.finalizedBlockHash = payload.blockHash;
		await rpc('engine_forkchoiceUpdatedV2', [state, null], true);
		head = { hash: payload.blockHash, timestamp: payload.timestamp };
		if (BigInt(payload.blockNumber) % 10n === 0n)
			console.info('Block ' + BigInt(payload.blockNumber));
		await sleep(850);
	}
}
main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
