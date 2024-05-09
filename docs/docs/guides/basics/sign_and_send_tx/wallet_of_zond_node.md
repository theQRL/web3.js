---
sidebar_position: 1
sidebar_label: 'Node Wallet'
---

# Using Node Wallet

If Zond node has unlocked account in its wallet you can send transaction without need of signing locally in web3.js

## Transaction

```ts
// First step: initialize web3 instance
import Web3 from 'web3';
const web3 = new Web3(/* PROVIDER*/);

// Second step: add an account to the Zond node and unlock it
const account = {
	seed: '0xb45b02f408a0dd0996aab2b55a54f4ed7735f82b133c0786a9ff372ffaaf11bd',
	address: '0xe4beef667408b99053dc147ed19592ada0d77f59',
};

// TODO(rgeraldes24)
// Make sure the account has enough zond on balance to send the transaction

// Third step: sign and send the transaction
try {
	const receipt = await web3.zond.sendTransaction({
		from: account.address,
		to: '0xe4beef667408b99053dc147ed19592ada0d77f59',
		value: '0x1',
		gas: '300000',
		// other transaction's params
	});
} catch (error) {
	// catch transaction error
	console.error(error);
}
```

List of references:

-   [zond.sendTransaction](/api/web3-zond/class/Web3Zond#sendTransaction)

## Contract Transaction

```ts
// First step: initialize web3 instance
import Web3 from 'web3';
const web3 = new Web3(/* PROVIDER*/);

// Second step: add an account to the Zond node and unlock it
const account = {
	seed: '0xb45b02f408a0dd0996aab2b55a54f4ed7735f82b133c0786a9ff372ffaaf11bd',
	address: '0xe4beef667408b99053dc147ed19592ada0d77f59',
};


// TODO(rgeraldes24)

// Make sure the account has enough zond on balance to send the transaction

// Third step: sign and send the transaction
try {
	// deploy
	const contract = new web3.zond.Contract(ContractAbi);
	const contractDeployed = await contract
		.deploy({
			input: ContractBytecode,
			arguments: ['Constructor param1', 'Constructor param2'],
		})
		.send({
			from: account.address,
			gas: '1000000',
			// other transaction's params
		});

	// call method
	await contractDeployed.methods
		.transfer('0xe2597eb05cf9a87eb1309e86750c903ec38e527e', '0x1')
		.send({
			from: account.address,
			gas: '1000000',
			// other transaction's params
		});
} catch (error) {
	// catch transaction error
	console.error(error);
}
```

List of references:

-   [zond.Contract](/api/web3-zond-contract/class/Contract)
-   [contract.deploy](/api/web3-zond-contract/class/Contract#deploy)
-   [contract.methods](/api/web3-zond-contract/class/Contract#methods)
