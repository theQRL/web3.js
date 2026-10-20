#!/usr/bin/env node

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

const { resolve } = require('path');
const { compile, version } = require('@theqrl/hypc');
const { format } = require('prettier');
const { rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');

const licenseHeader = `/*
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
*/`;

const buildPath = resolve(__dirname, '../fixtures/build');
const contractsPath = resolve(__dirname, '../fixtures/contracts');
const importDir = resolve(__dirname, '../node_modules');

function findImports(path) {
	const importPath = resolve(importDir, path);

	if (existsSync(importPath)) {
		return {
			contents: readFileSync(importPath, 'utf8'),
		};
	}

	return { error: 'File not found' };
}

(async () => {
	const fileNames = readdirSync(contractsPath, { withFileTypes: true })
		.filter(entry => entry.isFile() && entry.name.endsWith('.hyp'))
		.map(entry => entry.name)
		.sort();

	if (fileNames.length === 0) {
		throw new Error(`No Hyperion contracts found in ${contractsPath}`);
	}

	const sources = Object.fromEntries(
		fileNames.map(fileName => [
			fileName,
			{ content: readFileSync(resolve(contractsPath, fileName), 'utf8') },
		]),
	);

	const compileInput = {
		sources,
		language: 'Hyperion',
		settings: {
			// Keep the PublicResolver fixture below go-qrl's deployed code size limit.
			optimizer: { enabled: true, runs: 200 },
			outputSelection: {
				'*': { '*': ['abi', 'qrvm.bytecode.object', 'qrvm.deployedBytecode.object'] },
			},
		},
	};

	const compileResult = JSON.parse(
		compile(JSON.stringify(compileInput), { import: findImports }),
	);
	const diagnostics = compileResult.errors ?? [];
	for (const diagnostic of diagnostics) {
		console.error(diagnostic.formattedMessage ?? diagnostic.message);
	}
	if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
		throw new Error('Error while compiling contracts');
	}

	// Validate and format every fixture before replacing the previous build.
	const artifacts = await Promise.all(
		fileNames.map(async fileName => {
			const contractName = fileName.slice(0, -4);
			const contractBuild = compileResult.contracts?.[fileName]?.[contractName];
			const bytecode = contractBuild?.qrvm?.bytecode?.object;
			if (!Array.isArray(contractBuild?.abi) || !bytecode) {
				throw new Error(
					`Missing ABI or deployable bytecode for ${contractName} in ${fileName}`,
				);
			}

			const typescript = await format(
				`${licenseHeader}
export const ${contractName}Abi = ${JSON.stringify(contractBuild.abi)} as const;
export const ${contractName}Bytecode = '0x${bytecode}';`,
				{
					parser: 'typescript',
					printWidth: 100,
					singleQuote: true,
					trailingComma: 'all',
					useTabs: true,
					tabWidth: 4,
					arrowParens: 'avoid',
				},
			);
			return {
				contractName,
				json: `${JSON.stringify(contractBuild, undefined, '\t')}\n`,
				typescript,
			};
		}),
	);

	rmSync(buildPath, { recursive: true, force: true });
	mkdirSync(buildPath, { recursive: true });
	for (const { contractName, json, typescript } of artifacts) {
		writeFileSync(resolve(buildPath, `${contractName}.json`), json);
		writeFileSync(resolve(buildPath, `${contractName}.ts`), typescript);
	}

	console.info(`Compiled successfully: ${artifacts.length} contracts with Hyperion ${version()}`);
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
