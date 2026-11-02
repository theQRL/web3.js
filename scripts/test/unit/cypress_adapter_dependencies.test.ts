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
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

// Follow the adapter's dependencies rather than the workspace's current Jest.
// The scoped micromatch override must preserve the legacy formatter's behavior.
const adapterRequire = createRequire(require.resolve('cypress-jest-adapter'));
const expectRequire = createRequire(adapterRequire.resolve('expect'));
const messageRequire = createRequire(expectRequire.resolve('jest-message-util'));
const legacyExpect = adapterRequire('expect') as typeof expect;
const chalk = messageRequire('chalk') as { level: number; enabled: boolean };
const { formatStackTrace, formatExecError } = expectRequire('jest-message-util') as {
	formatStackTrace: (
		stack: string,
		config: { rootDir: string; testMatch: string[] },
		options: { noStackTrace: boolean },
	) => string;
	formatExecError: (
		error: Error,
		config: { rootDir: string; testMatch: string[] },
		options: { noStackTrace: boolean },
	) => string;
};
const rootDir = resolve(__dirname, '../../..');

test.each([
	['test/integration/events.test.ts', '**/?(*.)+(spec|test).[tj]s?(x)', true],
	['test/integration/events.spec.tsx', '**/?(*.)+(spec|test).[tj]s?(x)', true],
	['src/events.ts', '**/?(*.)+(spec|test).[tj]s?(x)', false],
	['test/unit/events.test.ts', 'test/{unit,integration}/**/*.test.ts', true],
	['test/e2e/events.test.ts', 'test/{unit,integration}/**/*.test.ts', false],
	['test/unit/events.test.ts', '!**/fixtures/**', true],
	['test/fixtures/events.test.ts', '!**/fixtures/**', false],
] as const)('formats the adapter stack path %s for %s', (file, pattern, matches) => {
	const previousLevel = chalk.level;
	const previousEnabled = chalk.enabled;
	chalk.level = 1;
	chalk.enabled = true;
	try {
		const formatted = formatStackTrace(
			`    at check (${resolve(rootDir, file)}:12:4)`,
			{ rootDir, testMatch: [pattern] },
			{ noStackTrace: false },
		);
		expect(stripVTControlCharacters(formatted)).toContain(`${file}:12:4`);
		expect(formatted.includes(`\u001b[36m${file}`)).toBe(matches);
	} finally {
		chalk.level = previousLevel;
		chalk.enabled = previousEnabled;
	}
});

test('retains the adapter assertion API and readable failure diagnostics', async () => {
	legacyExpect({ value: [1, 2] }).toEqual({ value: [1, 2] });
	await legacyExpect(Promise.resolve('ready')).resolves.toBe('ready');
	expect(() => legacyExpect({ value: 1 }).toEqual({ value: 2 })).toThrow(/Expected|expected/);
	const failure = new Error('adapter assertion failed');
	failure.stack = `Error: adapter assertion failed\n    at check (${resolve(rootDir, 'test/example.test.ts')}:12:4)`;
	const formatted = stripVTControlCharacters(
		formatExecError(failure, { rootDir, testMatch: ['**/*.test.ts'] }, { noStackTrace: false }),
	);
	expect(formatted).toContain('adapter assertion failed');
	expect(formatted).toContain('test/example.test.ts:12:4');
});
