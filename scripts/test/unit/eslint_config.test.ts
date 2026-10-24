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

import { spawnSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(__dirname, '../../..');

describe('Type-aware ESLint configuration', () => {
	it.each(['false', 'true'])(
		'resolves Jest globals while still reporting an unsafe call with CI=%s',
		ci => {
			const result = spawnSync(
				process.execPath,
				[
					'-e',
					String.raw`
const { ESLint } = require('eslint');
// CI's single-run TypeScript program reads from disk, so lint an actual fixture.
new ESLint().lintFiles(['scripts/test/fixtures/eslint/jest-globals.ts'])
	.then(results => console.log(JSON.stringify(results)))
	.catch(error => { console.error(error); process.exitCode = 1; });
`,
				],
				{ cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, CI: ci } },
			);

			expect(result.error).toBeUndefined();
			if (result.status !== 0) {
				throw new Error(`ESLint exited with status ${result.status}: ${result.stderr}`);
			}
			const [lintResult] = JSON.parse(result.stdout);
			expect(lintResult.errorCount).toBe(0);
			expect(
				lintResult.messages.filter(
					(message: { ruleId: string }) =>
						message.ruleId === '@typescript-eslint/no-unsafe-call',
				),
			).toEqual([expect.objectContaining({ line: 25, severity: 1 })]);
		},
	);
});
