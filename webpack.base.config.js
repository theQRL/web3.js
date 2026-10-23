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

const webpack = require('webpack');
const path = require('path');

/**
 * Shared webpack configuration for all packages
 */
function getWebPackConfig(packagePath, filename, library, entry, tsconf) {
	return {
		mode: 'production',
		entry: path.resolve(packagePath, entry),
		output: {
			path: path.resolve(packagePath, 'dist'),
			filename: filename,
			library: library,
			libraryExport: 'default',
			libraryTarget: 'umd',
			globalObject: 'this',
		},

		module: {
			rules: [
				{
					test: /\.ts$/,
					loader: 'ts-loader',
					options: {
						configFile: path.resolve(packagePath, tsconf),
					},
					exclude: ['/node_modules/', '/test/'],
				},
			],
		},
		resolve: {
			extensions: ['.ts', '.js'],
			// No Node core module gets a browser stand-in: runtime packages must
			// not import Node built-ins (the event emitter is the dependency-free
			// one from @theqrl/web3-utils, not Node's `events`, and nothing under
			// packages/*/src loads `stream`), and
			// scripts/check-package-dependencies.js fails the build inspection if
			// one creeps back in. Without a fallback, webpack 5 fails the bundle
			// instead of silently pulling in a hoisted, undeclared polyfill.
			fallback: {},
			extensionAlias: {
				'.js': ['.js', '.ts'],
			},
		},
		devtool: 'source-map',
		plugins: [
			new webpack.IgnorePlugin({
				checkResource(resource) {
					// "@ethereumjs/common/genesisStates" consists ~800KB static files which are no more needed
					return /(.*\/genesisStates\/.*\.json)/.test(resource);
				},
			}),
			new webpack.ProvidePlugin({
				process: 'process/browser',
			}),
		],
	};
}

module.exports = {
	getWebPackConfig,
};
