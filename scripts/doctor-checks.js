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

// Pure, file-free checks used by scripts/doctor.js so they can be unit tested
// without spawning the whole toolchain probe.

// Reads the keys of a top-level block (`overrides:` or `allowBuilds:`) in
// pnpm-workspace.yaml. Every key is a two-space-indented mapping entry,
// quoted when it carries a range specifier or a scope.
function listWorkspaceBlockKeys(workspaceYaml, blockName) {
	const lines = workspaceYaml.split('\n');
	const start = lines.indexOf(`${blockName}:`);
	if (start === -1) return undefined;

	const keys = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		if (!line.startsWith('  ')) break;

		const match = /^ {2}(?:"([^"]+)"|'([^']+)'|([^\s"'#][^:]*)):/.exec(line);
		if (match) keys.push(match[1] ?? match[2] ?? match[3]);
	}

	return keys;
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// True when the lockfile carries a `packages:` entry for the package, i.e. a
// header line such as `  keccak@3.0.4:` or `  '@parcel/watcher@2.5.1':`.
function lockfileHasPackage(lockfileText, packageName) {
	return new RegExp(`^ {2}'?${escapeRegExp(packageName)}@[^\\n:']+'?:$`, 'm').test(lockfileText);
}

// `allowBuilds` pre-approves install scripts. An entry for a package that is
// not in the lockfile approves whatever a future dependency change brings in
// under that name, without review (audit I-8).
function allowBuildsFailures(workspaceYaml, lockfileText) {
	const keys = listWorkspaceBlockKeys(workspaceYaml, 'allowBuilds');
	if (!keys) return ['pnpm-workspace.yaml must declare an allowBuilds block'];
	return keys
		.filter(key => !lockfileHasPackage(lockfileText, key))
		.map(
			key =>
				`pnpm-workspace.yaml allowBuilds pre-approves build scripts for ${key}, which is not in pnpm-lock.yaml; remove the stale entry`,
		);
}

// Every accepted advisory in .trivyignore must carry a `revisit by YYYY-MM-DD`
// marker, and the date must not have passed: an accepted vulnerability is a
// time-bounded exception, not a permanent one (audit I-9).
function trivyIgnoreFailures(trivyIgnoreText, today = new Date().toISOString().slice(0, 10)) {
	const failures = [];
	trivyIgnoreText.split('\n').forEach((rawLine, index) => {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) return;
		const lineNumber = index + 1;
		const [entry, ...rest] = line.split('#');
		const advisory = entry.trim();
		const comment = rest.join('#');
		const match = /revisit by (\d{4}-\d{2}-\d{2})/.exec(comment);
		if (!match) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has no "revisit by YYYY-MM-DD" marker`,
			);
			return;
		}
		if (Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has an invalid revisit date ${match[1]}`,
			);
			return;
		}
		if (match[1] < today) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} was to be revisited by ${match[1]}; re-assess the advisory and either remove the exception or record a new date`,
			);
		}
	});
	return failures;
}

module.exports = {
	allowBuildsFailures,
	listWorkspaceBlockKeys,
	lockfileHasPackage,
	trivyIgnoreFailures,
};
