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

const fs = require('node:fs');
const path = require('node:path');

const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-config-prettier');
const importPlugin = require('eslint-plugin-import-x');
const jest = require('eslint-plugin-jest');
const noNull = require('eslint-plugin-no-null');
const tsdoc = require('eslint-plugin-tsdoc');
const globals = require('globals');

tsPlugin.rules['ban-types'] ??= {
	meta: {
		type: 'problem',
		schema: [],
	},
	create: () => ({}),
};

const deprecatedNoopRule = {
	meta: {
		type: 'problem',
		schema: [],
	},
	create: () => ({}),
};

const license = [
	'',
	'This file is part of web3.js.',
	'',
	'web3.js is free software: you can redistribute it and/or modify',
	'it under the terms of the GNU Lesser General Public License as published by',
	'the Free Software Foundation, either version 3 of the License, or',
	'(at your option) any later version.',
	'',
	'web3.js is distributed in the hope that it will be useful,',
	'but WITHOUT ANY WARRANTY; without even the implied warranty of',
	'MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the',
	'GNU Lesser General Public License for more details.',
	'',
	'You should have received a copy of the GNU Lesser General Public License',
	'along with web3.js.  If not, see <http://www.gnu.org/licenses/>.',
	'',
];

const licenseComment = `\n${license.slice(1).join('\n')}\n`;

const qrlHeader = {
	rules: {
		header: {
			meta: {
				type: 'layout',
				docs: {
					description: 'require the repository LGPL header block',
				},
				schema: [],
				messages: {
					missing: 'Missing repository LGPL header block.',
				},
			},
			create(context) {
				return {
					Program(node) {
						const sourceCode = context.sourceCode;
						const firstComment = sourceCode.getAllComments()[0];
							if (
								firstComment &&
								firstComment.type === 'Block' &&
								firstComment.value.trim() === licenseComment.trim()
							) {
								return;
							}

						context.report({ node, messageId: 'missing' });
					},
				};
			},
		},
	},
};

const requireExtensions = {
	rules: {
		'require-extensions': {
			meta: {
				type: 'problem',
				fixable: 'code',
				schema: [],
				messages: {
					missing: 'Relative imports and exports must end with .js',
				},
			},
			create(context) {
				const sourceCode = context.sourceCode;

				function checkNode(node) {
					const source = node.source;
					if (!source || typeof source.value !== 'string') return;
					const value = source.value.replace(/\?.*$/, '');
					if (!value || !value.startsWith('.') || value.endsWith('.js')) return;

					const fileName = context.filename || context.getFilename?.();
					if (!fileName || fileName === '<input>') return;

					const importPath = path.resolve(path.dirname(fileName), value);
					if (fs.existsSync(importPath)) return;

					context.report({
						node,
						messageId: 'missing',
						fix:
							source.value.includes('?') || sourceCode.getText(source).startsWith('"')
								? undefined
								: fixer => fixer.replaceText(source, `'${source.value}.js'`),
					});
				}

				return {
					ExportAllDeclaration: checkNode,
					ExportNamedDeclaration: checkNode,
					ImportDeclaration: checkNode,
				};
			},
		},
	},
};

const sourceRules = {
	'require-extensions/require-extensions': 'error',
	'qrl-header/header': 'warn',
	'deprecation/deprecation': 'off',
	'header/header': 'off',
	'class-methods-use-this': ['error'],
	'no-unused-expressions': ['error'],
	'no-continue': 'off',
	'no-underscore-dangle': 'off',
	'import/prefer-default-export': 'off',
	'lines-between-class-members': 'off',
	'no-use-before-define': ['error'],
	'no-shadow': 'off',
	'no-console': ['error', { allow: ['error', 'info', 'warn'] }],
	'no-unassigned-vars': 'warn',
	'prefer-const': 'warn',
	'no-useless-assignment': 'warn',
	'preserve-caught-error': 'warn',
	'import/extensions': 'off',
	'no-await-in-loop': ['error'],
	'no-restricted-syntax': [
		'error',
		{
			selector: 'ForInStatement',
			message:
				'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
		},
		{
			selector: 'LabeledStatement',
			message:
				'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
		},
		{
			selector: 'WithStatement',
			message:
				'`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
		},
	],
	'no-null/no-null': ['error'],
	'tsdoc/syntax': 'warn',
};

const typeScriptRules = {
	'@typescript-eslint/no-shadow': ['error'],
	'@typescript-eslint/no-floating-promises': ['error'],
	'@typescript-eslint/prefer-for-of': ['error'],
	'@typescript-eslint/consistent-type-assertions': ['error'],
	'@typescript-eslint/explicit-member-accessibility': ['error'],
	'@typescript-eslint/member-ordering': [
		'error',
		{ default: ['public-static-field', 'public-instance-method'] },
	],
	'@typescript-eslint/no-extraneous-class': ['error'],
	'@typescript-eslint/no-unnecessary-boolean-literal-compare': ['error'],
	'@typescript-eslint/no-unnecessary-qualifier': ['error'],
	'@typescript-eslint/no-unnecessary-type-arguments': ['error'],
	'@typescript-eslint/prefer-function-type': ['error'],
	'@typescript-eslint/prefer-includes': ['error'],
	'@typescript-eslint/prefer-nullish-coalescing': ['warn'],
	'@typescript-eslint/prefer-optional-chain': ['warn'],
	'@typescript-eslint/prefer-readonly': ['error'],
	'@typescript-eslint/prefer-reduce-type-parameter': ['error'],
	'@typescript-eslint/prefer-string-starts-ends-with': ['error'],
	'@typescript-eslint/prefer-ts-expect-error': ['error'],
	'@typescript-eslint/promise-function-async': ['error'],
	'@typescript-eslint/require-array-sort-compare': ['error'],
	'@typescript-eslint/switch-exhaustiveness-check': ['warn'],
	'@typescript-eslint/unified-signatures': 'off',
	'@typescript-eslint/no-unused-expressions': ['error'],
	'@typescript-eslint/no-useless-constructor': ['error'],
	'@typescript-eslint/explicit-module-boundary-types': 'off',
	'@typescript-eslint/no-unused-vars': 'warn',
	'@typescript-eslint/no-base-to-string': 'warn',
	'@typescript-eslint/no-duplicate-type-constituents': 'warn',
	'@typescript-eslint/no-empty-object-type': 'warn',
	'@typescript-eslint/no-explicit-any': 'warn',
	'@typescript-eslint/no-misused-promises': 'warn',
	'@typescript-eslint/no-redundant-type-constituents': 'warn',
	'@typescript-eslint/no-unnecessary-type-assertion': 'off',
	'@typescript-eslint/no-unsafe-enum-comparison': 'warn',
	'@typescript-eslint/no-unsafe-argument': 'warn',
	'@typescript-eslint/no-unsafe-assignment': 'warn',
	'@typescript-eslint/no-unsafe-call': 'warn',
	'@typescript-eslint/no-unsafe-member-access': 'warn',
	'@typescript-eslint/no-unsafe-return': 'warn',
	'@typescript-eslint/only-throw-error': 'warn',
	'@typescript-eslint/require-await': 'warn',
	'@typescript-eslint/prefer-promise-reject-errors': 'warn',
	'@typescript-eslint/restrict-template-expressions': 'warn',
};

const testRules = {
	'require-extensions/require-extensions': 'off',
	'jest/valid-title': ['error'],
	'jest/no-conditional-expect': ['error'],
	'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
	'jest/consistent-test-it': ['error'],
	'class-methods-use-this': ['error'],
	'dot-notation': 'off',
	'lines-between-class-members': 'off',
	'arrow-body-style': 'off',
	'no-underscore-dangle': 'off',
	'no-null/no-null': ['error'],
};

const testTypeScriptRules = {
	'@typescript-eslint/no-magic-numbers': 'off',
	'@typescript-eslint/unbound-method': 'off',
	'@typescript-eslint/no-require-imports': ['error'],
	'@typescript-eslint/no-explicit-any': 'off',
	'@typescript-eslint/no-unsafe-argument': 'off',
	'@typescript-eslint/no-unsafe-assignment': 'off',
	'@typescript-eslint/no-unsafe-member-access': 'off',
	'@typescript-eslint/no-unsafe-call': ['warn'],
	'@typescript-eslint/no-unsafe-return': ['warn'],
	'@typescript-eslint/no-unnecessary-type-assertion': 'off',
	'@typescript-eslint/no-empty-function': ['error'],
	'@typescript-eslint/require-await': ['warn'],
	'@typescript-eslint/restrict-template-expressions': ['warn'],
};

const legacyNullRestriction = {
	'@typescript-eslint/no-restricted-types': 'off',
};

// Type-safety rules that are `warn` repo-wide. For a small set of
// security-relevant packages whose production sources are already CLEAN of these
// warnings (verified with `pnpm run lint:budget` / eslint), we escalate them to
// `error` so a regression cannot slip in as just another warning. Scope is
// `src/**` only: test files keep the relaxed `warn`/`off` treatment.
const escalatedTypeSafetyRules = {
	'@typescript-eslint/no-explicit-any': 'error',
	'@typescript-eslint/no-misused-promises': 'error',
	'@typescript-eslint/no-unsafe-argument': 'error',
	'@typescript-eslint/no-unsafe-assignment': 'error',
	'@typescript-eslint/no-unsafe-call': 'error',
	'@typescript-eslint/no-unsafe-member-access': 'error',
	'@typescript-eslint/no-unsafe-return': 'error',
};

// The provider packages are the repository's untrusted-input boundary: they read
// and parse HTTP / WebSocket / IPC JSON-RPC responses. Their production sources
// currently carry ZERO of the rules above, so we hold that line at `error`.
const typeSafetyStrictPackages = [
	'packages/web3-providers-http',
	'packages/web3-providers-ipc',
	'packages/web3-providers-ws',
];

function existingProjects(rootDir, patterns) {
	return patterns
		.map(pattern => path.join(rootDir, pattern))
		.filter(projectPath => fs.existsSync(projectPath))
		.map(projectPath => path.relative(rootDir, projectPath).split(path.sep).join('/'));
}

function workspaceDirectories(rootDir) {
	return ['packages', 'tools'].flatMap(parent => {
		const parentPath = path.join(rootDir, parent);
		if (!fs.existsSync(parentPath)) return [];
		return fs
			.readdirSync(parentPath, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.map(entry => `${parent}/${entry.name}`);
	});
}

function createWeb3Config({ rootDir }) {
	const workspaceDirs = workspaceDirectories(rootDir);
	const typedProjects = existingProjects(rootDir, [
		// Keep strict type checking while resolving the Jest globals used in tests.
		'tsconfig.eslint.json',
		'tsconfig.base.json',
		...workspaceDirs.flatMap(directory => [
			`${directory}/tsconfig.esm.json`,
			`${directory}/tsconfig.json`,
			`${directory}/test/tsconfig.json`,
		]),
		'packages/web3/test/cjs_black_box/tsconfig.json',
		'packages/web3/test/esm_black_box/tsconfig.json',
	]);

	return [
		{
			ignores: [
				'**/node_modules/**',
				'**/lib/**',
				'**/dist/**',
				'**/coverage/**',
				'**/.coverage/**',
				'**/.turbo/**',
				'docs/build/**',
				'**/cypress/**',
				'**/cypress.config.js',
				'**/jest.config.js',
				'**/src/common/chains/**',
				'**/src/common/qips/**',
				'**/src/common/hardforks/**',
				'tmp/**',
			],
		},
		js.configs.recommended,
		...tsPlugin.configs['flat/recommended-type-checked'].map(config => ({
			...config,
			files: ['**/*.ts'],
		})),
		prettier,
		{
			files: ['**/*.{js,cjs,mjs,ts}'],
			languageOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				globals: {
					...globals.browser,
					...globals.node,
					BigInt: 'readonly',
				},
			},
			plugins: {
					import: importPlugin,
					deprecation: { rules: { deprecation: deprecatedNoopRule } },
					header: qrlHeader,
					'no-null': noNull,
					'qrl-header': qrlHeader,
					'require-extensions': requireExtensions,
				tsdoc,
			},
			rules: sourceRules,
		},
		{
			files: ['**/*.ts'],
			languageOptions: {
				parser: tsParser,
				parserOptions: {
					project: typedProjects,
					tsconfigRootDir: rootDir,
					sourceType: 'module',
				},
			},
			plugins: {
				'@typescript-eslint': tsPlugin,
			},
				rules: {
					...typeScriptRules,
					...legacyNullRestriction,
				},
			},
			{
				files: ['packages/abi/src/**/*.ts'],
				rules: {
					'@typescript-eslint/consistent-type-assertions': 'warn',
					'@typescript-eslint/explicit-member-accessibility': 'warn',
					'@typescript-eslint/no-for-in-array': 'warn',
					'@typescript-eslint/no-shadow': 'warn',
					'@typescript-eslint/unbound-method': 'warn',
					'@typescript-eslint/prefer-for-of': 'warn',
					'class-methods-use-this': 'warn',
					'no-case-declarations': 'warn',
					'no-console': 'warn',
					'no-empty': 'warn',
					'no-null/no-null': 'warn',
					'no-restricted-syntax': 'warn',
					'no-use-before-define': 'warn',
				},
			},
		{
			files: ['**/test/**/*.{js,cjs,mjs,ts}', '**/*.test.ts'],
			languageOptions: {
				globals: {
					...globals.jest,
				},
			},
			plugins: {
				'@typescript-eslint': tsPlugin,
				jest,
			},
			rules: testRules,
		},
		{
			files: ['**/test/**/*.ts', '**/*.test.ts'],
			plugins: {
				'@typescript-eslint': tsPlugin,
			},
			rules: testTypeScriptRules,
		},
		// Escalation overrides come last so they win for the matched sources.
		// They target `src/**` only, so they never overlap the test overrides
		// above.
		...typeSafetyStrictPackages.map(pkg => ({
			files: [`${pkg}/src/**/*.ts`],
			plugins: {
				'@typescript-eslint': tsPlugin,
			},
			rules: escalatedTypeSafetyRules,
		})),
	];
}

module.exports = {
	createWeb3Config,
};
