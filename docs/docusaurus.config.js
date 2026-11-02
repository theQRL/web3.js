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

const { themes } = require('prism-react-renderer');

const packages = [
	'../packages/abi',
	'../packages/web3',
	'../packages/web3-qrl',
	'../packages/web3-qrl-contract',
	'../packages/web3-utils',
	'../packages/web3-validator',
	'../packages/web3-types',
	'../packages/web3-core',
	'../packages/web3-errors',
	'../packages/web3-net',
	'../packages/web3-qrl-abi',
	'../packages/web3-qrl-accounts',
	'../packages/web3-qrl-qrns',
	'../packages/web3-providers-http',
	'../packages/web3-providers-ws',
	'../packages/web3-providers-ipc',
];

/** @type {import('@docusaurus/types').Config} */
const config = {
	title: 'QRL Web3.js',
	tagline: 'The ultimate JavaScript library for QRL',
	url: 'https://docs.theqrl.org',
	baseUrl: '/',
	onBrokenLinks: 'throw',
	markdown: {
		hooks: {
			onBrokenMarkdownLinks: 'throw',
		},
	},
	favicon: 'img/favicon.ico',

	// GitHub pages deployment config.
	// If you aren't using GitHub pages, you don't need these.
	organizationName: 'theQRL', // Usually your GitHub org/user name.
	projectName: 'web3.js', // Usually your repo name.

	// Even if you don't use internalization, you can use this field to set useful
	// metadata like html lang. For example, if your site is Chinese, you may want
	// to replace "en" with "zh-Hans".
	i18n: {
		defaultLocale: 'en',
		locales: ['en'],
	},

	plugins: [
		'@docusaurus/theme-live-codeblock',
		[
			'docusaurus-plugin-typedoc',
			{
				id: 'api',
				entryPoints: packages,
				entryPointStrategy: 'packages',
				out: './docs/api',
				tsconfig: '../docs/tsconfig.docs.json',
				plugin: ['typedoc-plugin-markdown', 'typedoc-plugin-extras', 'typedoc-plugin-mdn-links'],
				readme: 'none',
				sanitizeComments: true,
				packageOptions: {
					entryPoints: ['src/index.ts'],
					tsconfig: '../../docs/tsconfig.docs.json',
					readme: 'none',
					skipErrorChecking: true,
				},
				sidebar: {
					autoConfiguration: false,
				},
			},
		],
		'docusaurus-lunr-search',
	],
	presets: [
		[
			'classic',
			/** @type {import('@docusaurus/preset-classic').Options} */
			({
				docs: {
					sidebarPath: require.resolve('./sidebars.js'),
					routeBasePath: '/', // Serve the docs at the site's root
					// Please change this to your repo.
					// Remove this to remove the "edit this page" links.
					editUrl: 'https://github.com/theqrl/web3.js/tree/main/docs',
				},
				theme: {
					customCss: require.resolve('./src/css/custom.css'),
				},
			}),
		],
	],

	themeConfig:
		/** @type {import('@docusaurus/preset-classic').ThemeConfig} */
		({
			navbar: {
				title: 'QRL Web3.js Docs',
				logo: {
					src: 'img/web3js.svg',
				},
				items: [
					{
						to: '/',
						activeBasePath: '/',
						label: 'Documentation',
						position: 'left',
					},
					{
						to: 'api', // 'api' is the 'out' directory
						label: 'API',
						position: 'left',
					},
					{
						to: '/glossary/json_interface',
						activeBasePath: '/glossary/',
						label: 'Glossary',
						position: 'left',
					},
					{
						href: 'https://github.com/theQRL/web3.js/tree/main/',
						label: 'GitHub',
						position: 'right',
					},
					{
						href: 'https://theqrl.org/',
						label: 'QRL',
						position: 'right',
					},
				],
			},
			footer: {
				style: 'dark',
				links: [
					{
						title: 'Community',
						items: [
							{
								label: 'QRL website',
								href: 'https://theqrl.org/',
							},
							{
								label: 'Discord',
								href: 'https://theqrl.org/discord',
							},
						],
					},
				],
				copyright: `Copyright © ${new Date().getFullYear()} The QRL Contributors. Built with Docusaurus.`,
			},
			prism: {
				theme: themes.github,
				darkTheme: themes.dracula,
			},
			liveCodeBlock: {
				/**
				 * The position of the live playground, above or under the editor
				 * Possible values: "top" | "bottom"
				 */
				playgroundPosition: 'bottom',
			},
		}),
};

module.exports = config;
