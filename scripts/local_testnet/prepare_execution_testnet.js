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

// Prepare only the public development fixtures; this is never a public-network node.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const output = process.argv[2];
if (!output) throw new Error('Usage: prepare_execution_testnet.js <empty-state-directory>');
fs.mkdirSync(output, { recursive: true });
if (fs.readdirSync(output).length !== 0) throw new Error('State directory must be empty');
const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf8'));
const password = 'web3-local-dev-only';
const write = (name, content) =>
	fs.writeFileSync(path.join(output, name), content, { mode: 0o600 });
const alloc = Object.fromEntries(
	accounts.map(account => [account.address, { balance: `0x${(10n ** 27n).toString(16)}` }]),
);
for (const precompile of [1, 2, 3, 4, 5])
	alloc[`Q${precompile.toString(16).padStart(128, '0')}`] = { balance: '0x1' };
write(
	'genesis.json',
	JSON.stringify({
		config: { chainId: 1337, isDev: true },
		gasLimit: '0x1c9c380',
		baseFeePerGas: '0x174876e800',
		alloc,
	}),
);
write('jwt.hex', crypto.randomBytes(32).toString('hex'));
write('password.txt', `${password}\n`);
write('addresses.txt', `${accounts.map(account => account.address).join('\n')}\n`);
for (const [index, account] of accounts.entries())
	write(`seed-${index}.txt`, account.seed.replace(/^0x/, ''));
write(
	'rules.js',
	`var approvedSenders = ${JSON.stringify(accounts.map(account => account.address.toLowerCase()))};
function ApproveTx(request) { return approvedSenders.indexOf(request.transaction.from.toLowerCase()) >= 0 ? 'Approve' : 'Reject'; }
function ApproveSignData(request) { return approvedSenders.indexOf(request.address.toLowerCase()) >= 0 ? 'Approve' : 'Reject'; }
function ApproveListing() { return 'Approve'; }
function OnSignerStartup() {}
function OnApprovedTx() {}
`,
);
