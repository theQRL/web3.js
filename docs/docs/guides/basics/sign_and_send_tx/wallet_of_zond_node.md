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

// Second step: sign and send the transaction
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

-   [eth.sendTransaction](/api/web3-eth/class/Web3Zond#sendTransaction)

## Contract Transaction

```ts
// First step: initialize web3 instance
import Web3 from 'web3';
const web3 = new Web3(/* PROVIDER*/);

// Second step: sign and send the transaction
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

-   [eth.Contract](/api/web3-eth-contract/class/Contract)
-   [contract.deploy](/api/web3-eth-contract/class/Contract#deploy)
-   [contract.methods](/api/web3-eth-contract/class/Contract#methods)
