---
sidebar_position: 2
sidebar_label: 'QRL Package Usage Example'
---

# Getting Started with `qrl` Package

## Introduction

The `web3-qrl` package provides a set of powerful functionalities to interact with the QRL blockchain and smart contracts. In this tutorial, we will guide you through the basics of using the `web3-qrl` package of web3.js. We will be using TypeScript throughout the examples.

## Overview

Here is a high-level overview of the steps we will be taking in this tutorial:

1. Setting up the Environment
2. Create a new project directory and initialize a new Node.js project.
3. Set up web3.js and connect to a local Gqrl node
4. Interact with the QRL blockchain using web3.js.

## Step 1: Setting up the Environment

Before we start writing and deploying our contract, we need to set up our environment. For that, we need to install the following:

1. Gqrl - run a local Gqrl development node with HTTP JSON-RPC enabled on `http://localhost:8545`.
2. Node.js - Node.js is a JavaScript runtime environment that allows you to run JavaScript on the server-side. You can download it from https://nodejs.org/en/download/
3. npm - Node Package Manager is used to publish and install packages to and from the public npm registry or a private npm registry. Here is how to install it https://docs.npmjs.com/downloading-and-installing-node-js-and-npm. (Alternatively, you can use pnpm instead of npm https://pnpm.io/installation)

## Step 2: Create a new project directory and initialize a new Node.js project

First, create a new project directory for your project and navigate into it:

```
mkdir web3-qrl-tutorial
cd web3-qrl-tutorial
```

Next, initialize a new Node.js project using npm:

```
npm init -y
```

This will create a new `package.json` file in your project directory.

```
npm install typescript
npm install --save @types/node
```

This will install typescript for our project and install the types for node.

Next create a `tsconfig.json` file in your project directory with the following content:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

## Step 3: Set up web3.js and connect to a local Gqrl node

In this step, we will set up the web3.js library and connect to a local Gqrl development node. Make sure Gqrl is running locally with HTTP JSON-RPC available at `http://localhost:8545`.

First, install the `web3` package using npm:

```
npm install @theqrl/web3
```

After the first audited release, you can check the latest published version at https://www.npmjs.com/package/@theqrl/web3?activeTab=versions.

Next, create a new file called `index.ts` in your project directory and add the following code to it:

```javascript
const { Web3 } = require('@theqrl/web3'); //  web3.js has native ESM builds and (`import Web3 from '@theqrl/web3'`)

// Set up a connection to the local Gqrl node
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

// Log the current block number to the console
web3.qrl
	.getBlockNumber()
	.then(result => {
		console.log('Current block number: ' + result);
	})
	.catch(error => {
		console.error(error);
	});
```

This code sets up a connection to the local Gqrl node and logs the current block number to the console.

Run the following command to test the connection:

```
npx ts-node index.ts
```

If everything is working correctly, you should see the current block number logged to the console. If you get `connect ECONNREFUSED 127.0.0.1:8545`, check that your local Gqrl node is running and exposing HTTP JSON-RPC on port `8545`.

## Step 3: Interact with the QRL blockchain using web3.js

In this step, we will use web3.js to interact with the local Gqrl node.

In the first example, we are going to send a simple value transaction.
Create a file named `transaction.ts` and fill it with the following code:

```typescript
const { Web3 } = require('@theqrl/web3'); //  web3.js has native ESM builds and (`import Web3 from '@theqrl/web3'`)
const fs = require('fs');
const path = require('path');

// Set up a connection to the QRL network
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
// Context option, inherited by `web3.qrl` and by contracts created from `web3`.
web3.handleRevert = true;

async function interact() {
	//fetch all the available accounts
	const accounts = await web3.qrl.getAccounts();
	console.log(accounts);

	let balance1, balance2;
	//The initial balances of the accounts should be 100 Quanta (10^18 planck)
	balance1 = await web3.qrl.getBalance(accounts[0]);
	balance2 = await web3.qrl.getBalance(accounts[1]);

	console.log(balance1, balance2);

	//create a transaction sending 1 Quanta from account 0 to account 1
	const transaction = {
		from: accounts[0],
		to: accounts[1],
		value: web3.utils.toPlanck('1', 'quanta'), // value should be passed in planck. For easier use and to avoid mistakes we utilize the auxiliary `toPlanck` function.
	};

	//send the actual transaction; the promise resolves with the receipt of the mined transaction
	const receipt = await web3.qrl.sendTransaction(transaction);
	console.log('transactionHash', receipt.transactionHash);

	balance1 = await web3.qrl.getBalance(accounts[0]);
	balance2 = await web3.qrl.getBalance(accounts[1]);

	// see the updated balances
	console.log(balance1, balance2);

	// irrelevant with the actual transaction, just to know the gasPrice
	const gasPrice = await web3.qrl.getGasPrice();
	console.log(gasPrice);
}

(async () => {
	await interact();
})();
```

:::note
These examples assume your local Gqrl development node exposes accounts that can be used by JSON-RPC for local testing. Do not use production accounts or production private keys in local tutorial code.
:::

Run the following:

```
npx ts-node transaction.ts
```

If everything is working correctly, you should see something like the following:

```typescript
[
  'Qc68863f36C48ec168AD45A86c96347D520eac1Cf',
  'Q80c05939B307f9833d905A685575b45659d3EA70',
  'QA260Cf742e03B48ea1A2b76b0d20aaCfe6F85E5E',
  'Qf457b8C0CBE41e2a85b6222A97b7b7bC6Df1C0c0',
  'Q32dF9a0B365b6265Fb21893c551b0766084DDE21',
  'Q8a6A2b8b00C1C8135F1B25DcE54f73Ee18bEF43d',
  'QAFc526Be4a2656f7E02501bdf660AbbaA8fb3d7A',
  'Qc32618116370fF776Ecd18301c801e146A1746b3',
  'QDCCD49880dCf9603835B0f522c31Fcf0579b46Ff',
  'Q036006084Cb62b7FAf40B979868c0c03672a59B5'
]
100000000000000000000n 100000000000000000000n

transactionHash 0xf685b64ccf5930d3779a33335ca22195b68901dbdc439f79dfc65d87c7ae88b0

98999580000000000000n 101000000000000000000n

20000000000n

```

:::note
📝 In order to calculate the actual quanta spent, we have to calculate the value sent plus the fees. Initial_balance = (Remaining_balance + value + gasUsed\*gasPrice). In our case:

98999580000000000000 + 1000000000000000000 + (20000000000\*21000) = 100 Quanta
:::

In the next example, we are going to use `estimateGas` function to see the expected gas for contract deployment. (For more on contracts, please see the corresponding tutotial). Create a file named `estimate.ts` and fill it with the following code:

```typescript
import Web3, { QRL_DATA_FORMAT, DEFAULT_RETURN_FORMAT } from '@theqrl/web3';

async function estimate() {
	// abi of our contract
	const abi = [
		{
			inputs: [{ internalType: 'uint256', name: '_myNumber', type: 'uint256' }],
			stateMutability: 'nonpayable',
			type: 'constructor',
		},
		{
			inputs: [],
			name: 'myNumber',
			outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [{ internalType: 'uint256', name: '_myNumber', type: 'uint256' }],
			name: 'setMyNumber',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
	];

	const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

	//get the available accounts
	const accounts = await web3.qrl.getAccounts();
	let acc = await accounts[0];

	let contract = new web3.qrl.Contract(abi, undefined);

	const deployment = contract.deploy({
		data: '0x608060405234801561001057600080fd5b506040516101d93803806101d983398181016040528101906100329190610054565b806000819055505061009e565b60008151905061004e81610087565b92915050565b60006020828403121561006657600080fd5b60006100748482850161003f565b91505092915050565b6000819050919050565b6100908161007d565b811461009b57600080fd5b50565b61012c806100ad6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c806323fd0e401460375780636ffd773c146051575b600080fd5b603d6069565b6040516048919060bf565b60405180910390f35b6067600480360381019060639190608c565b606f565b005b60005481565b8060008190555050565b60008135905060868160e2565b92915050565b600060208284031215609d57600080fd5b600060a9848285016079565b91505092915050565b60b98160d8565b82525050565b600060208201905060d2600083018460b2565b92915050565b6000819050919050565b60e98160d8565b811460f357600080fd5b5056fea2646970667358221220d28cf161457f7936995800eb9896635a02a559a0561bff6a09a40bfb81cd056564736f6c63430008000033',
		// @ts-expect-error
		arguments: [1],
	});
	estimatedGas = await deployment.estimateGas(
		{
			from: acc,
		},
		DEFAULT_RETURN_FORMAT, // the returned data will be formatted as a bigint
	);

	console.log(estimatedGas);

	let estimatedGas = await deployment.estimateGas(
		{
			from: acc,
		},
		QRL_DATA_FORMAT, // the returned data will be formatted as a hexstring
	);

	console.log(estimatedGas);
}

(async () => {
	await estimate();
})();
```

Run the following:

```
npx ts-node estimate.ts
```

If everything is working correctly, you should see something like the following:

```typescript
0x22568;
```

:::note
📝 Note that numbers returned from web3.js are returned by default in the `BigInt` format. In this example we used `QRL_DATA_FORMAT` parameter, which, can be passed in most methods in web3.js in order to format the result in `hex`.
:::

In the next example we are going to sign a transaction and use `sendSignedTransaction` to send the signed transaction. Create a file named `sendSigned.ts` and fill it with the following code:

```typescript
import Web3 from '@theqrl/web3';
const web3 = new Web3('http://localhost:8545');

// Replace this with the extended seed of a local development account only.
// A QRL account is identified by a 51-byte extended seed (hex string of 102
// characters after `0x`): a 3-byte descriptor followed by the 48-byte seed from
// which the ML-DSA-87 key pair is derived. `web3.qrl.accounts.create().seed`
// returns one; there is no separate "private key" value.
const seed = '0x010000...';
const value = web3.utils.toPlanck('1', 'quanta');

async function sendSigned() {
	const accounts = await web3.qrl.getAccounts();
	const fromAddress = accounts[0];
	const toAddress = accounts[1];
	// Create a new transaction object
	const tx = {
		from: fromAddress,
		to: toAddress,
		value: value,
		gas: 21000,
		maxFeePerGas: web3.utils.toPlanck('10', 'shor'),
		maxPriorityFeePerGas: 30000000,
		nonce: await web3.qrl.getTransactionCount(fromAddress),
	};

	// Sign the transaction with the account seed
	const signedTx = await web3.qrl.accounts.signTransaction(tx, seed);

	// Send the signed transaction to the network
	const receipt = await web3.qrl.sendSignedTransaction(signedTx.rawTransaction);

	console.log('Transaction receipt:', receipt);
}
(async () => {
	await sendSigned();
})();
```

Run the following:

```
npx ts-node sendSigned.ts
```

If everything is working correctly, you should see something like the following:

```ts
Transaction receipt: {
  transactionHash: '0x742df8f1ad4d04f6e5632889109506dbb7cdc8a6a1c80af3dfdfc71a67a04ddc',
  transactionIndex: 0n,
  blockNumber: 1n,
  blockHash: '0xab6678d76499b0ee383f182ab8f848ba27bd787e70e227524255c86b25224ed3',
  from: 'Q66ce32a5200aac57b258c4eac26bc1493fefddea',
  to: 'Q0afcfc43ac454348d8170c77b1f912b518b4ebe8',
  cumulativeGasUsed: 21000n,
  gasUsed: 21000n,
  logs: [],
  logsBloom: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  status: 1n,
  effectiveGasPrice: 10000000000n,
  type: 2n
}
```

## Conclusion

In this tutorial, we learned how to use different methods provided by the `@theqrl/web3` package.

With this knowledge, you can start experimenting with the QRL blockchain. Keep in mind that this is just the beginning, and there is a lot more to learn about QRL and web3.js. So keep exploring and building, and have fun!

## Additional Resources

-   [QRL Web3.js Documentation](https://docs.theqrl.org/)
-   [Hyperion Documentation](https://solidity.readthedocs.io/)
-   Gqrl local development node

## Tips and Best Practices

-   Always test your smart contracts on a local Gqrl development node before deploying them to mainnet.
-   Use the latest version of web3.js and Hyperion to take advantage of the latest features and security patches.
-   Keep your private keys secure and never share them with anyone.
-   Use the gas limit and gas fee parameters carefully to avoid spending too much on transaction fees.
-   Use the `estimateGas` function in web3.js to estimate the gas required for a transaction before sending it to the network.
-   Use events to notify the client application about state changes in the smart contract.
-   Use a linter like Solhint to check for common Hyperion coding errors.

## Final Thoughts

Web3.js provides a powerful and easy-to-use interface for interacting with the QRL network and building decentralized applications. And it has been rewritten in TypeScript but for simplicity of this tutorial we interacted with it in JavaScript.

The QRL ecosystem is constantly evolving, and there is always more to learn and discover. As you continue to develop your skills and knowledge, keep exploring and experimenting with new technologies and tools to build innovative and decentralized solutions.
