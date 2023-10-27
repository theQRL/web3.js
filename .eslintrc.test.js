module.exports = {
	parserOptions: {
		project: './tsconfig.base.json',
		tsconfigRootDir: __dirname,
	},
	extends: ['@theqrl/eslint-config-base-web3/ts-jest'],
};
