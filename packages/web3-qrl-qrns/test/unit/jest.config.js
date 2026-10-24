const base = require('../config/jest.config');

module.exports = {
	...base,
	testMatch: ['<rootDir>/test/unit/**/*.(spec|test).(js|ts)'],

	coverageDirectory: '.coverage/unit',
	collectCoverageFrom: ['src/**'],
	coverageThreshold: {
		global: {
			statements: 97,
			branches: 93,
			functions: 87,
			lines: 98,
		},
	},
	collectCoverage: true,
	coverageReporters: [
		[
			'json',
			{
				file: 'web3-qrl-qrns-unit-coverage.json',
			},
		],
	],
};
