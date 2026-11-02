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

// Cross-checks the import specifiers of every workspace package against its
// package.json. A package that resolves a module only because the monorepo
// hoists it (nodeLinker: hoisted) breaks under pnpm's isolated linker, Yarn
// PnP or any strict resolver as soon as it is installed from the registry
// (audit L-65: `@theqrl/abi` required `@theqrl/qrl-cryptography` without
// declaring it). The check reads:
//
// - `src/**/*.ts` with the TypeScript parser, so TSDoc examples and comments
//   are ignored and `import type` is told apart from runtime imports. This
//   runs before a build (CI runs `pnpm run doctor` right after install).
// - the built `lib/**/*.js` output when it exists (`require()`, `import`,
//   `export … from`, `import()`), which is the ground truth for what the
//   published package loads at runtime. `release:inspect-packages` runs the
//   check with `requireBuilt` so the release pipeline cannot skip it.
//
// Rules (failures stop `pnpm run doctor` and the release inspection):
// 1. A runtime import must be declared in dependencies, peerDependencies or
//    optionalDependencies; a devDependency is not enough.
// 2. A type-only import (`import type`, `export type … from`) may also be a
//    devDependency, because it is erased from the runtime output.
// 3. Built output may import Node built-ins only in the packages listed in
//    `nodeOnlyPackages`; every other publishable package is browser-facing and
//    must stay bundler-safe (audit L-66: `events` broke Vite/esbuild/Rollup
//    consumers). Private workspace tools are exempt from this rule.
// Warnings (printed, not fatal): a plain import of a Node built-in in a
// browser-facing package's `src` (TypeScript elides it when only types are
// used — spell it `import type` to make that explicit), and a dependency of a
// publishable package that nothing imports and that is not a peer dependency
// of another declared dependency (`ws` for `isomorphic-ws`).

const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const ts = require('typescript');

const builtins = new Set(builtinModules.filter(name => !name.startsWith('_')));

// Packages that are Node-only by design and the built-ins they may load.
const nodeOnlyPackages = {
	'@theqrl/web3-providers-ipc': ['fs', 'net'],
};

const workspaceRoots = ['packages', 'tools'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const runtimeExtensions = new Set(['.js', '.cjs', '.mjs']);

const stripNodePrefix = specifier =>
	specifier.startsWith('node:') ? specifier.slice(5) : specifier;

// Returns the package name a bare specifier resolves to, or undefined for
// relative, absolute, URL and subpath-import specifiers.
function packageNameOf(specifier) {
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('#') ||
		(/^[a-z]+:/i.test(specifier) && !specifier.startsWith('node:'))
	) {
		return undefined;
	}
	const bare = stripNodePrefix(specifier);
	const parts = bare.split('/');
	return bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const isBuiltin = name => builtins.has(name);

function walkFiles(directory, extensions, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue;
			walkFiles(entryPath, extensions, out);
		} else if (extensions.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
			out.push(entryPath);
		}
	}
	return out;
}

const allTypeOnly = elements =>
	elements.length > 0 && elements.every(element => element.isTypeOnly);

// Collects every module specifier of one file with the TypeScript parser.
// `typeOnly` is true when the whole declaration is erased by the compiler.
function collectSpecifiers(filePath, text, scriptKind) {
	const sourceFile = ts.createSourceFile(
		filePath,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind,
	);
	const found = [];
	const record = (node, specifier, typeOnly) => {
		const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		found.push({ specifier, typeOnly, line: line + 1 });
	};

	const visit = node => {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
			const clause = node.importClause;
			const typeOnly = Boolean(
				clause &&
				(clause.isTypeOnly ||
					(!clause.name &&
						clause.namedBindings &&
						ts.isNamedImports(clause.namedBindings) &&
						allTypeOnly(clause.namedBindings.elements))),
			);
			record(node, node.moduleSpecifier.text, typeOnly);
		} else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			const typeOnly = Boolean(
				node.isTypeOnly ||
				(node.exportClause &&
					ts.isNamedExports(node.exportClause) &&
					allTypeOnly(node.exportClause.elements)),
			);
			record(node, node.moduleSpecifier.text, typeOnly);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference) &&
			ts.isStringLiteral(node.moduleReference.expression)
		) {
			record(node, node.moduleReference.expression.text, Boolean(node.isTypeOnly));
		} else if (
			ts.isCallExpression(node) &&
			node.arguments.length > 0 &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
		) {
			record(node, node.arguments[0].text, false);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return found;
}

const addUse = (map, name, location, typeOnly) => {
	const entry = map.get(name) ?? { typeOnly: true, locations: [] };
	entry.typeOnly = entry.typeOnly && typeOnly;
	entry.locations.push(location);
	map.set(name, entry);
};

// Groups the specifiers of a file set by package name.
function scanFiles(root, files, scriptKind) {
	const uses = new Map();
	for (const filePath of files) {
		const text = fs.readFileSync(filePath, 'utf8');
		for (const { specifier, typeOnly, line } of collectSpecifiers(filePath, text, scriptKind)) {
			const name = packageNameOf(specifier);
			if (!name) continue;
			addUse(
				uses,
				name,
				`${path.relative(root, filePath).split(path.sep).join('/')}:${line}`,
				typeOnly,
			);
		}
	}
	return uses;
}

function listWorkspacePackages(root) {
	return workspaceRoots.flatMap(workspaceRoot => {
		const absoluteRoot = path.join(root, workspaceRoot);
		if (!fs.existsSync(absoluteRoot)) return [];
		return fs
			.readdirSync(absoluteRoot, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.map(entry => path.join(absoluteRoot, entry.name))
			.filter(packagePath => fs.existsSync(path.join(packagePath, 'package.json')));
	});
}

function analyzePackage(root, packagePath) {
	const manifest = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
	const sourceFiles = walkFiles(path.join(packagePath, 'src'), sourceExtensions);
	let builtFiles = walkFiles(path.join(packagePath, 'lib'), runtimeExtensions);
	// A dependency-free tool such as the shared ESLint config has neither
	// `src` nor `lib`; its entrypoint is the runtime code.
	if (sourceFiles.length === 0 && builtFiles.length === 0 && typeof manifest.main === 'string') {
		const main = path.join(packagePath, manifest.main);
		if (fs.existsSync(main) && runtimeExtensions.has(path.extname(main))) builtFiles = [main];
	}
	return {
		path: packagePath,
		name: manifest.name,
		manifest,
		sourceUses: scanFiles(root, sourceFiles, ts.ScriptKind.TS),
		builtUses: scanFiles(root, builtFiles, ts.ScriptKind.JS),
		builtFileCount: builtFiles.length,
	};
}

const keysOf = value => Object.keys(value ?? {});

// A dependency that is a peerDependency of another declared dependency is
// installed for that dependency's sake, not imported directly.
function isPeerOfDeclaredDependency(root, pkg, name) {
	for (const dependency of keysOf(pkg.manifest.dependencies)) {
		if (dependency === name) continue;
		for (const base of [path.join(pkg.path, 'node_modules'), path.join(root, 'node_modules')]) {
			const manifestPath = path.join(base, dependency, 'package.json');
			if (!fs.existsSync(manifestPath)) continue;
			try {
				const peers =
					JSON.parse(fs.readFileSync(manifestPath, 'utf8')).peerDependencies ?? {};
				if (Object.prototype.hasOwnProperty.call(peers, name)) return true;
			} catch {
				// An unreadable manifest is not evidence either way.
			}
			break;
		}
	}
	return false;
}

const describe = (entry, limit = 3) => entry.locations.slice(0, limit).join(', ');

// Runs the dependency cross-check for every workspace package under `root`
// (default: the repository) and returns `{ failures, warnings, packages }`.
// With `requireBuilt`, a package without built output is a failure.
function checkPackageDependencies({
	root = path.resolve(__dirname, '..'),
	requireBuilt = false,
} = {}) {
	const failures = [];
	const warnings = [];
	const packages = listWorkspacePackages(root).map(packagePath =>
		analyzePackage(root, packagePath),
	);

	for (const pkg of packages) {
		const label = pkg.name ?? path.relative(root, pkg.path);
		const runtimeDeclared = new Set([
			...keysOf(pkg.manifest.dependencies),
			...keysOf(pkg.manifest.peerDependencies),
			...keysOf(pkg.manifest.optionalDependencies),
		]);
		const devDeclared = new Set(keysOf(pkg.manifest.devDependencies));
		const allowedBuiltins = new Set(nodeOnlyPackages[pkg.name] ?? []);
		const isPrivate = pkg.manifest.private === true;
		// Private tools never reach a browser bundle; publishable packages do.
		const nodeOnly =
			isPrivate || Object.prototype.hasOwnProperty.call(nodeOnlyPackages, pkg.name);
		const builtinAllowed = name => isPrivate || allowedBuiltins.has(name);

		for (const [name, entry] of pkg.sourceUses) {
			if (name === pkg.name) continue;
			if (isBuiltin(name)) {
				if (!entry.typeOnly && (!nodeOnly || !builtinAllowed(name))) {
					warnings.push(
						`${label}: src imports the Node built-in \`${name}\` without \`import type\` (${describe(entry)}); browser-facing packages must not load Node built-ins at runtime`,
					);
				}
				continue;
			}
			if (runtimeDeclared.has(name)) continue;
			if (entry.typeOnly && devDeclared.has(name)) continue;
			failures.push(
				devDeclared.has(name)
					? `${label}: \`${name}\` is imported at runtime (${describe(entry)}) but is only a devDependency; move it to dependencies`
					: `${label}: \`${name}\` is imported (${describe(entry)}) but not declared in package.json`,
			);
		}

		if (requireBuilt && pkg.builtFileCount === 0) {
			failures.push(
				`${label}: no built output under lib/; run the build before the dependency check`,
			);
		}

		for (const [name, entry] of pkg.builtUses) {
			if (name === pkg.name) continue;
			if (isBuiltin(name)) {
				if (!nodeOnly || !builtinAllowed(name)) {
					failures.push(
						`${label}: built output loads the Node built-in \`${name}\` (${describe(entry)}); only ${Object.keys(nodeOnlyPackages).join(', ')} may depend on Node at runtime`,
					);
				}
				continue;
			}
			if (runtimeDeclared.has(name)) continue;
			failures.push(
				`${label}: built output loads \`${name}\` (${describe(entry)}) which is not in dependencies, peerDependencies or optionalDependencies`,
			);
		}

		if (isPrivate || (pkg.sourceUses.size === 0 && pkg.builtUses.size === 0)) continue;
		for (const name of keysOf(pkg.manifest.dependencies)) {
			if (name.startsWith('@types/')) continue;
			if (pkg.sourceUses.has(name) || pkg.builtUses.has(name)) continue;
			if (isPeerOfDeclaredDependency(root, pkg, name)) continue;
			warnings.push(`${label}: dependency \`${name}\` is declared but never imported`);
		}
	}

	return { failures, warnings, packages: packages.length };
}

module.exports = { checkPackageDependencies, collectSpecifiers, packageNameOf, nodeOnlyPackages };

if (require.main === module) {
	const requireBuilt = process.argv.includes('--require-built');
	const { failures, warnings, packages } = checkPackageDependencies({ requireBuilt });
	for (const message of warnings) console.warn(`WARN ${message}`);
	if (failures.length > 0) {
		for (const message of failures) console.error(`FAIL ${message}`);
		process.exit(1);
	}
	console.info(`Dependency cross-check passed for ${packages} workspace packages`);
}
