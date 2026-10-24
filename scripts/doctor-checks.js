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

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');

const leadingSpaces = line => /^ */.exec(line)[0].length;

const isBlankOrComment = line => line.trim() === '' || line.trim().startsWith('#');

// Reads the keys of a top-level block (`overrides:` or `allowBuilds:`) in
// pnpm-workspace.yaml. The block's indentation is taken from its first entry
// (two or four spaces are both valid YAML), nested values are skipped, and a
// flow mapping on the header line (`allowBuilds: {keccak: true}`) is read too,
// so a stale entry cannot hide behind a formatting variant.
function listWorkspaceBlockKeys(workspaceYaml, blockName) {
	const lines = workspaceYaml.split('\n');
	const headerPattern = new RegExp(`^${escapeRegExp(blockName)}:(\\s|$)`);
	const start = lines.findIndex(line => headerPattern.test(line));
	if (start === -1) return undefined;

	const inline = lines[start]
		.slice(blockName.length + 1)
		.replace(/\s#.*$/, '')
		.trim();
	if (inline.startsWith('{')) {
		return inline
			.replace(/^\{|\}$/g, '')
			.split(',')
			.map(entry => unquote(entry.split(':')[0]))
			.filter(Boolean);
	}

	const keys = [];
	let indent;
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (isBlankOrComment(line)) continue;
		const spaces = leadingSpaces(line);
		if (spaces === 0) break;
		if (indent === undefined) indent = spaces;
		if (spaces < indent) break;
		if (spaces > indent) continue;

		const match = /^ *(?:"([^"]+)"|'([^']+)'|([^\s"'#][^:]*)):/.exec(line);
		if (match) keys.push(match[1] ?? match[2] ?? match[3]);
	}

	return keys;
}

// Reads the entries of a top-level block sequence (`minimumReleaseAgeExclude:`)
// in pnpm-workspace.yaml, quoted or not, at any indentation.
function listWorkspaceBlockItems(workspaceYaml, blockName) {
	const { parse } = require('yaml');
	const document = parse(workspaceYaml, { maxAliasCount: 100 });
	if (!document || !Object.prototype.hasOwnProperty.call(document, blockName)) return undefined;
	const items = document[blockName];
	if (!Array.isArray(items) || items.some(item => typeof item !== 'string')) {
		throw new Error(`${blockName} must be a YAML sequence of strings`);
	}
	return items;
}

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

// `minimumReleaseAgeExclude` lifts the seven-day quarantine. A name-only entry
// exempts every future release of that package for ever, so every entry other
// than the first-party `@theqrl/*` scope must pin exact versions
// (`name@1.2.3`, several joined with `||`) — the releases the overrides resolve
// to (audit P4-L-47).
const exactVersions = String.raw`\d+\.\d+\.\d+(?:\|\|\d+\.\d+\.\d+)*`;
const pinnedExcludePattern = new RegExp(`^(?:@[^/@\\s]+/)?[^/@\\s]+@${exactVersions}$`);

function minimumReleaseAgeExcludeFailures(workspaceYaml) {
	const entries = listWorkspaceBlockItems(workspaceYaml, 'minimumReleaseAgeExclude');
	if (!entries) return [];
	return entries
		.filter(entry => entry !== '@theqrl/*' && !pinnedExcludePattern.test(entry))
		.map(
			entry =>
				`pnpm-workspace.yaml minimumReleaseAgeExclude entry ${entry} is not pinned to exact versions (name@x.y.z, several joined with ||); a name-only exclude exempts every future release of the package from the seven-day quarantine`,
		);
}

const isoDate = date => date.toISOString().slice(0, 10);

// Strict calendar parse of YYYY-MM-DD: `2026-02-30` is rejected rather than
// rolled over to March.
function parseCalendarDate(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return undefined;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
		? date
		: undefined;
}

// Every accepted advisory in .trivyignore must carry a `revisit by YYYY-MM-DD`
// marker, the date must be a real calendar day, it must not have passed, and it
// must lie within two years: an accepted vulnerability is a time-bounded
// exception, not a permanent one (audit I-9).
function trivyIgnoreFailures(trivyIgnoreText, today = isoDate(new Date())) {
	const failures = [];
	const todayDate = parseCalendarDate(today);
	const limit = isoDate(
		new Date(
			Date.UTC(
				todayDate.getUTCFullYear() + 2,
				todayDate.getUTCMonth(),
				todayDate.getUTCDate(),
			),
		),
	);
	trivyIgnoreText.split('\n').forEach((rawLine, index) => {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) return;
		const lineNumber = index + 1;
		const [entry, ...rest] = line.split('#');
		const advisory = entry.trim();
		const comment = rest.join('#');
		const markers = comment.match(/revisit by \S+/g) ?? [];
		if (markers.length > 1) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has ${markers.length} "revisit by" markers; keep exactly one so the date that applies is unambiguous`,
			);
			return;
		}
		const match = /revisit by (\d{4}-\d{2}-\d{2})/.exec(comment);
		if (!match) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has no "revisit by YYYY-MM-DD" marker`,
			);
			return;
		}
		if (!parseCalendarDate(match[1])) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has an invalid revisit date ${match[1]}`,
			);
			return;
		}
		if (match[1] < today) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} was to be revisited by ${match[1]}; re-assess the advisory and either remove the exception or record a new date`,
			);
			return;
		}
		if (match[1] > limit) {
			failures.push(
				`.trivyignore:${lineNumber} ${advisory} has a revisit date ${match[1]} more than two years out (latest accepted: ${limit}); an accepted advisory must be re-assessed within two years`,
			);
		}
	});
	return failures;
}

// Reads the settings of the `aquasecurity/trivy-action` step in a workflow:
// the `version:` input under `with:` and whether `TRIVY_INCLUDE_DEV_DEPS` is
// set to true under the step's `env:`. Comments are stripped first, so a
// comment that mentions the version does not satisfy the parity check.
function trivyActionSettings(workflowYaml) {
	const lines = workflowYaml
		.split('\n')
		.map(line => (line.trim().startsWith('#') ? '' : line.replace(/\s#.*$/, '')));
	const usesIndex = lines.findIndex(line =>
		/^\s*(- )?uses:\s*aquasecurity\/trivy-action@/.test(line),
	);
	if (usesIndex === -1) return undefined;

	let start = usesIndex;
	while (start > 0 && !/^\s*- /.test(lines[start])) start -= 1;
	const stepIndent = leadingSpaces(lines[start]);

	const block = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim() === '') continue;
		if (leadingSpaces(line) <= stepIndent) break;
		block.push(line);
	}

	const section = name => {
		const headerIndex = block.findIndex(line =>
			new RegExp(`^ {${stepIndent + 2}}${name}:\\s*$`).test(line),
		);
		if (headerIndex === -1) return [];
		const entries = [];
		for (let index = headerIndex + 1; index < block.length; index += 1) {
			if (leadingSpaces(block[index]) <= stepIndent + 2) break;
			entries.push(block[index].trim());
		}
		return entries;
	};
	const valueOf = (entries, key) => {
		const entry = entries.find(line => line.startsWith(`${key}:`));
		return entry ? unquote(entry.slice(key.length + 1)) : undefined;
	};

	return {
		version: valueOf(section('with'), 'version'),
		includeDevDeps: valueOf(section('env'), 'TRIVY_INCLUDE_DEV_DEPS') === 'true',
	};
}

module.exports = {
	allowBuildsFailures,
	listWorkspaceBlockItems,
	listWorkspaceBlockKeys,
	lockfileHasPackage,
	minimumReleaseAgeExcludeFailures,
	parseCalendarDate,
	trivyActionSettings,
	trivyIgnoreFailures,
};
