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

import { execFileSync, spawnSync } from 'child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import ts from 'typescript';

const script = ts.transpileModule(readFileSync(resolve(__dirname, '../../init.ts'), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
let directory: string;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'web3-secrets-'));
	mkdirSync(join(directory, 'templates'));
	writeFileSync(join(directory, 'templates/.secrets.json.tmpl'), '{}');
	writeFileSync(join(directory, 'init.js'), script);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it.each([false, true])('creates or restricts a normal secrets file (existing=%s)', existing => {
	const secrets = join(directory, '.secrets.json');
	if (existing) {
		writeFileSync(secrets, '{}');
		chmodSync(secrets, 0o644);
	}
	execFileSync(process.execPath, ['init.js'], { cwd: directory });
	expect(readFileSync(secrets, 'utf8')).toBe('{}');
	if (process.platform !== 'win32') expect(statSync(secrets).mode & 0o777).toBe(0o600);
});
(process.platform === 'win32' ? it.skip : it)(
	'refuses symlinks without chmodding their target',
	() => {
		const victim = join(directory, 'victim');
		writeFileSync(victim, 'unchanged');
		chmodSync(victim, 0o644);
		symlinkSync(victim, join(directory, '.secrets.json'));
		const result = spawnSync(process.execPath, ['init.js'], {
			cwd: directory,
			encoding: 'utf8',
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('must not be a symlink');
		expect(statSync(victim).mode & 0o777).toBe(0o644);
		expect(readFileSync(victim, 'utf8')).toBe('unchanged');
	},
);
