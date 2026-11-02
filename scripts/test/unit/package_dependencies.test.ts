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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

interface CheckResult {
	failures: string[];
	warnings: string[];
	packages: number;
}

interface DependencyCheck {
	checkPackageDependencies: (options?: { root?: string; requireBuilt?: boolean }) => CheckResult;
}

// The check is plain CommonJS shared with scripts/doctor.js; no declaration file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkPackageDependencies } = require('../../check-package-dependencies') as DependencyCheck;

const repositoryRoot = resolve(__dirname, '../../..');

describe('Package dependency cross-check (L-65, L-66, I-8)', () => {
	let root: string;

	const writePackage = (
		directory: string,
		manifest: Record<string, unknown>,
		files: Record<string, string>,
	) => {
		const packagePath = join(root, directory);
		mkdirSync(packagePath, { recursive: true });
		writeFileSync(join(packagePath, 'package.json'), `${JSON.stringify(manifest)}\n`);
		for (const [relativePath, content] of Object.entries(files)) {
			mkdirSync(dirname(join(packagePath, relativePath)), { recursive: true });
			writeFileSync(join(packagePath, relativePath), content);
		}
	};

	const check = (options?: { requireBuilt?: boolean }) =>
		checkPackageDependencies({ root, ...options });

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'web3-dependency-check-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('passes on the repository tree once every runtime import is declared (L-65, I-8)', () => {
		const result = checkPackageDependencies({ root: repositoryRoot });
		expect(result.packages).toBeGreaterThanOrEqual(19);
		expect(result.failures).toEqual([]);
	});

	it('reports a runtime import that package.json does not declare (L-65)', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0', dependencies: { '@scope/beta': '1.0.0' } },
			{
				'src/index.ts':
					"import { pad } from 'left-pad';\nimport { b } from '@scope/beta';\nexport const x = pad(b);\n",
			},
		);

		const { failures } = check();

		expect(failures).toHaveLength(1);
		expect(failures[0]).toMatch(
			/@scope\/alpha: `left-pad` is imported \(packages\/alpha\/src\/index\.ts:1\) but not declared/,
		);
	});

	it('reports a runtime import that is only a devDependency', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0', devDependencies: { 'left-pad': '1.0.0' } },
			{ 'src/index.ts': "export { pad } from 'left-pad';\n" },
		);

		expect(check().failures).toEqual([
			'@scope/alpha: `left-pad` is imported at runtime (packages/alpha/src/index.ts:1) but is only a devDependency; move it to dependencies',
		]);
	});

	it('accepts type-only imports satisfied by a devDependency and subpath imports of a dependency', () => {
		writePackage(
			'packages/alpha',
			{
				name: '@scope/alpha',
				version: '1.0.0',
				dependencies: { '@theqrl/qrl-cryptography': '0.3.3' },
				devDependencies: { '@ethersproject/bignumber': '5.8.0' },
			},
			{
				'src/index.ts':
					"import type { BigNumber } from '@ethersproject/bignumber';\n" +
					"import { type Other, type Another } from '@ethersproject/bignumber';\n" +
					"export type { Other } from '@ethersproject/bignumber';\n" +
					"import { utf8ToBytes } from '@theqrl/qrl-cryptography/utils.js';\n" +
					'export const f = (v: BigNumber, o: Other, a: Another) => utf8ToBytes(String(v) + String(o) + String(a));\n',
			},
		);

		expect(check().failures).toEqual([]);
	});

	it('ignores import examples inside comments and relative imports', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0' },
			{
				'src/index.ts':
					"/**\n * @example\n * import { Web3 } from '@theqrl/web3';\n * const x = require('nope');\n */\n" +
					"// import stale from 'stale-package';\n" +
					"import { helper } from './helper.js';\nexport const y = helper;\n",
				'src/helper.ts': 'export const helper = 1;\n',
			},
		);

		expect(check().failures).toEqual([]);
	});

	it('checks the built output for undeclared modules and Node built-ins (L-65, L-66)', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0', dependencies: { 'left-pad': '1.0.0' } },
			{
				'src/index.ts': "export { pad } from 'left-pad';\n",
				'lib/commonjs/index.js':
					'"use strict";\nconst events_1 = require("events");\nexports.pad = require("left-pad").pad;\nexports.q = require("@scope/undeclared");\n',
				'lib/esm/index.js':
					"import { EventEmitter } from 'node:events';\nexport { pad } from 'left-pad';\n",
			},
		);
		writePackage(
			'packages/ipc',
			{ name: '@theqrl/web3-providers-ipc', version: '1.0.0' },
			{ 'lib/commonjs/index.js': 'const net = require("net");\nconst fs = require("fs");\n' },
		);
		writePackage(
			'tools/private-tool',
			{ name: '@scope/private-tool', version: '1.0.0', private: true, main: 'index.cjs' },
			{ 'index.cjs': "const fs = require('fs');\nmodule.exports = fs;\n" },
		);

		const { failures } = check();

		expect(failures).toEqual([
			'@scope/alpha: built output loads the Node built-in `events` (packages/alpha/lib/commonjs/index.js:2, packages/alpha/lib/esm/index.js:1); only @theqrl/web3-providers-ipc may depend on Node at runtime',
			'@scope/alpha: built output loads `@scope/undeclared` (packages/alpha/lib/commonjs/index.js:4) which is not in dependencies, peerDependencies or optionalDependencies',
		]);
	});

	it('fails for a package without built output only when requireBuilt is set', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0' },
			{ 'src/index.ts': 'export const x = 1;\n' },
		);

		expect(check().failures).toEqual([]);
		expect(check({ requireBuilt: true }).failures).toEqual([
			'@scope/alpha: no built output under lib/; run the build before the dependency check',
		]);
	});

	it('warns about a declared dependency that nothing imports, but not about peers of dependencies (I-8)', () => {
		writePackage(
			'packages/alpha',
			{
				name: '@scope/alpha',
				version: '1.0.0',
				dependencies: {
					'is-odd': '1.0.0',
					'left-pad': '1.0.0',
					ws: '8.0.0',
					'isomorphic-ws': '5.0.0',
				},
			},
			{
				'src/index.ts':
					"export { odd } from 'is-odd';\nexport { WS } from 'isomorphic-ws';\n",
			},
		);
		mkdirSync(join(root, 'node_modules/isomorphic-ws'), { recursive: true });
		writeFileSync(
			join(root, 'node_modules/isomorphic-ws/package.json'),
			JSON.stringify({ name: 'isomorphic-ws', peerDependencies: { ws: '*' } }),
		);

		const { failures, warnings } = check();

		expect(failures).toEqual([]);
		expect(warnings).toEqual([
			'@scope/alpha: dependency `left-pad` is declared but never imported',
		]);
	});

	it('warns about a plain Node built-in import in a browser-facing package source (L-66)', () => {
		writePackage(
			'packages/alpha',
			{ name: '@scope/alpha', version: '1.0.0' },
			{
				'src/index.ts':
					"import { Socket } from 'net';\nimport type { ClientRequestArgs } from 'http';\nexport type S = Socket;\nexport type A = ClientRequestArgs;\n",
			},
		);

		const { failures, warnings } = check();

		expect(failures).toEqual([]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(
			/`net` without `import type` \(packages\/alpha\/src\/index\.ts:1\)/,
		);
	});
});
