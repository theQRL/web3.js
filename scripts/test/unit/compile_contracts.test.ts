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
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(__dirname, '../../..');

describe('Contract compilation CLI', () => {
	let directory: string;
	let contractsPath: string;
	let buildPath: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'web3-compile-contracts-'));
		contractsPath = join(directory, 'fixtures/contracts');
		buildPath = join(directory, 'fixtures/build');
		mkdirSync(join(directory, 'scripts'));
		mkdirSync(contractsPath, { recursive: true });
		mkdirSync(buildPath);
		copyFileSync(
			join(root, 'scripts/compile_contracts.js'),
			join(directory, 'scripts/compile_contracts.js'),
		);
		symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
		writeFileSync(join(buildPath, 'previous.json'), '{"previous":true}\n');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	const compile = () =>
		spawnSync(process.execPath, [join(directory, 'scripts/compile_contracts.js')], {
			cwd: directory,
			encoding: 'utf8',
			timeout: 30_000,
		});

	const expectPreviousBuild = () => {
		expect(readdirSync(buildPath).sort()).toEqual(['previous.json']);
		expect(readFileSync(join(buildPath, 'previous.json'), 'utf8')).toBe('{"previous":true}\n');
	};

	it('compiles imports despite warnings and replaces stale fixtures with JSON and TypeScript', () => {
		writeFileSync(
			join(contractsPath, 'Sample.hyp'),
			`pragma hyperion >=0.0;
import '@theqrl/qrl-contracts/token/SQRCTF1/SQRCTF1.hyp';
contract Sample is SQRCTF1 {
	constructor() SQRCTF1('Sample', 'SMP') {}
}`,
		);
		writeFileSync(join(contractsPath, 'README.md'), 'Only .hyp files should be compiled.');

		const result = compile();

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.stderr).toContain('Warning:');
		expect(result.stdout).toContain('Compiled successfully');
		expect(readdirSync(buildPath).sort()).toEqual(['Sample.json', 'Sample.ts']);
		const artifact = JSON.parse(readFileSync(join(buildPath, 'Sample.json'), 'utf8'));
		expect(artifact.abi).toContainEqual(
			expect.objectContaining({ type: 'function', name: 'transfer' }),
		);
		expect(artifact.qrvm.bytecode.object).toMatch(/^[0-9a-f]+$/);
		const typescript = readFileSync(join(buildPath, 'Sample.ts'), 'utf8');
		expect(typescript).toContain('export const SampleAbi =');
		expect(typescript).toContain('as const;');
		expect(typescript).toContain(`'0x${artifact.qrvm.bytecode.object}'`);
		expect(typescript).toContain('This file is part of web3.js.');
	});

	it('reproduces all committed fixtures with the pinned compiler', () => {
		for (const fileName of readdirSync(join(root, 'fixtures/contracts'))) {
			if (fileName.endsWith('.hyp')) {
				copyFileSync(
					join(root, 'fixtures/contracts', fileName),
					join(contractsPath, fileName),
				);
			}
		}

		const result = compile();
		const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`Hyperion ${manifest.devDependencies['@theqrl/hypc']}+`);
		const committedBuildPath = join(root, 'fixtures/build');
		// Directory order is filesystem-dependent: compare sorted listings.
		const fileNames = readdirSync(committedBuildPath).sort();
		expect(readdirSync(buildPath).sort()).toEqual(fileNames);
		for (const fileName of fileNames) {
			expect(readFileSync(join(buildPath, fileName), 'utf8')).toBe(
				readFileSync(join(committedBuildPath, fileName), 'utf8'),
			);
		}
		for (const fileName of fileNames.filter(name => name.endsWith('.json'))) {
			const artifact = JSON.parse(readFileSync(join(buildPath, fileName), 'utf8'));
			// go-qrl's MaxCodeSize and MaxInitCodeSize apply to these fixtures too.
			expect(artifact.qrvm.deployedBytecode.object).toMatch(/^[0-9a-f]+$/);
			expect(artifact.qrvm.deployedBytecode.object.length / 2).toBeLessThanOrEqual(24576);
			expect(artifact.qrvm.bytecode.object.length / 2).toBeLessThanOrEqual(49152);
		}
	});

	it('exits unsuccessfully on compiler errors and preserves existing fixtures', () => {
		writeFileSync(
			join(contractsPath, 'Broken.hyp'),
			'pragma hyperion >=0.0; contract Broken {',
		);

		const result = compile();

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('ParserError');
		expect(result.stdout).not.toContain('Compiled successfully');
		expectPreviousBuild();
	});

	it('rejects a missing named contract instead of silently omitting its fixtures', () => {
		writeFileSync(
			join(contractsPath, 'Sample.hyp'),
			'pragma hyperion >=0.0; contract Different {}',
		);

		const result = compile();

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Sample.hyp');
		expect(result.stdout).not.toContain('Compiled successfully');
		expectPreviousBuild();
	});

	it('fails if there are no Hyperion sources and preserves existing fixtures', () => {
		const result = compile();

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stdout).not.toContain('Compiled successfully');
		expectPreviousBuild();
	});

	it('exits unsuccessfully on filesystem errors and preserves existing fixtures', () => {
		rmSync(contractsPath, { recursive: true });

		const result = compile();

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('ENOENT');
		expect(existsSync(buildPath)).toBe(true);
		expectPreviousBuild();
	});
});
