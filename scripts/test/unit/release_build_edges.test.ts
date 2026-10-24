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

/* eslint-disable jest/no-conditional-expect -- verify both successful and failed build restoration */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withWorkspaceLinks } = require('../../release/build-with-workspace-links') as {
	withWorkspaceLinks: (build: () => void, cwd: string) => void;
};
describe('release builds preserve workspace edges', () => {
	it.each([false, true])('restores exact publishing ranges after a build (failure=%s)', fail => {
		const root = mkdtempSync(join(tmpdir(), 'web3-release-edges-'));
		const a = join(root, 'packages/a/package.json');
		const b = join(root, 'packages/b/package.json');
		mkdirSync(join(root, 'packages/a'), { recursive: true });
		mkdirSync(join(root, 'packages/b'), { recursive: true });
		const before = JSON.stringify({
			name: '@s/a',
			version: '1.0.3',
			dependencies: { '@s/b': '^1.0.2', external: '2.0.0' },
		});
		writeFileSync(a, before);
		writeFileSync(b, JSON.stringify({ name: '@s/b', version: '0.5.0' }));
		try {
			const build = () => {
				expect(JSON.parse(readFileSync(a, 'utf8'))).toEqual({
					name: '@s/a',
					version: '1.0.3',
					dependencies: { '@s/b': 'workspace:*', external: '2.0.0' },
				});
				if (fail) throw new Error('build failed');
			};
			if (fail) expect(() => withWorkspaceLinks(build, root)).toThrow('build failed');
			else withWorkspaceLinks(build, root);
			expect(readFileSync(a, 'utf8')).toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
