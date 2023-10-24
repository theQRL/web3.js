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
// import { RLP } from '@ethereumjs/rlp';
// import { bytesToHex, hexToBytes, uint8ArrayEquals } from '@theqrl/web3-utils';
// import {
// 	Chain,
// 	Common,
// 	Hardfork,
// 	//intToUint8Array,
// 	toUint8Array,
// 	//uint8ArrayToBigInt,
// 	unpadUint8Array,
// } from '../../../src/common';

// import { Transaction } from '../../../src';
// import type { TxData } from '../../../src';
// import txFixturesEip155 from '../../fixtures/json/ttTransactionTestEip155VitaliksTests.json';
// import txFixtures from '../../fixtures/json/txs.json';

// describe('[Transaction]', () => {
// 	const transactions: Transaction[] = [];

// 	it('cannot input decimal or negative values', () => {
// 		const values = ['gasPrice', 'gasLimit', 'nonce', 'value', 'publicKey', 'signature'];
// 		const cases = [
// 			10.1,
// 			'10.1',
// 			'0xaa.1',
// 			-10.1,
// 			-1,
// 			BigInt(-10),
// 			'-100',
// 			'-10.1',
// 			'-0xaa',
// 			Infinity,
// 			-Infinity,
// 			NaN,
// 			{},
// 			true,
// 			false,
// 			// eslint-disable-next-line @typescript-eslint/no-empty-function
// 			() => {},
// 			Number.MAX_SAFE_INTEGER + 1,
// 		];
// 		for (const value of values) {
// 			const txData: any = {};
// 			for (const testCase of cases) {
// 				txData[value] = testCase;
// 				expect(() => {
// 					Transaction.fromTxData(txData);
// 				}).toThrow();
// 			}
// 		}
// 	});

// 	it('Initialization', () => {
// 		const nonEIP2930Common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul });
// 		expect(Transaction.fromTxData({}, { common: nonEIP2930Common })).toBeTruthy();

// 		const txData = txFixtures[3].raw.map(toUint8Array);
// 		//txData[6] = intToUint8Array(45); // v with 0-parity and chain ID 5
// 		let tx = Transaction.fromValuesArray(txData);
// 		expect(tx.common.chainId() === BigInt(1)).toBe(true);

// 		// txData[6] = intToUint8Array(46); // v with 1-parity and chain ID 5
// 		// tx = Transaction.fromValuesArray(txData);
// 		// expect(tx.common.chainId() === BigInt(5)).toBe(true);

// 		// txData[6] = intToUint8Array(2033); // v with 0-parity and chain ID 999
// 		// tx = Transaction.fromValuesArray(txData);
// 		// expect(tx.common.chainId()).toEqual(BigInt(999));

// 		// txData[6] = intToUint8Array(2034); // v with 1-parity and chain ID 999
// 		// tx = Transaction.fromValuesArray(txData);
// 		// expect(tx.common.chainId()).toEqual(BigInt(999));
// 	});

// 	it('Initialization -> decode with fromValuesArray()', () => {
// 		for (const tx of txFixtures.slice(0, 4)) {
// 			const txData = tx.raw.map(toUint8Array);
// 			const pt = Transaction.fromValuesArray(txData);

// 			expect(bytesToHex(unpadUint8Array(toUint8Array(pt.nonce)))).toEqual(tx.raw[0]);
// 			expect(bytesToHex(toUint8Array(pt.gasPrice))).toEqual(tx.raw[1]);
// 			expect(bytesToHex(toUint8Array(pt.gasLimit))).toEqual(tx.raw[2]);
// 			expect(pt.to?.toString()).toEqual(tx.raw[3]);
// 			expect(bytesToHex(unpadUint8Array(toUint8Array(pt.value)))).toEqual(tx.raw[4]);
// 			expect(bytesToHex(pt.data)).toEqual(tx.raw[5]);
// 			expect(bytesToHex(toUint8Array(pt.publicKey))).toEqual(tx.raw[6]);
// 			expect(bytesToHex(toUint8Array(pt.signature))).toEqual(tx.raw[7]);

// 			transactions.push(pt);
// 		}
// 	});

// 	// it('Initialization -> should accept lesser r values', () => {
// 	// 	const tx = Transaction.fromTxData({ r: uint8ArrayToBigInt(toUint8Array('0x0005')) });
// 	// 	expect(tx.r!.toString(16)).toBe('5');
// 	// });

// 	// it('Initialization -> throws when creating a a transaction with incompatible chainid and v value', () => {
// 	// 	let common = new Common({ chain: Chain.Goerli, hardfork: Hardfork.Petersburg });
// 	// 	let tx = Transaction.fromTxData({}, { common });
// 	// 	expect(tx.common.chainId()).toEqual(BigInt(5));
// 	// 	const privKey = hexToBytes(txFixtures[0].privateKey);
// 	// 	tx = tx.sign(privKey);
// 	// 	const serialized = tx.serialize();
// 	// 	common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Petersburg });
// 	// 	expect(() => Transaction.fromSerializedTx(serialized, { common })).toThrow();
// 	// });

// 	// it('Initialization -> throws if v is set to an EIP155-encoded value incompatible with the chain id', () => {
// 	// 	expect(() => {
// 	// 		const common = new Common({ chain: 42, hardfork: Hardfork.Petersburg });
// 	// 		Transaction.fromTxData({ v: BigInt(1) }, { common });
// 	// 	}).toThrow();
// 	// });

// 	it('validate() -> should validate with string option', () => {
// 		for (const tx of transactions) {
// 			expect(typeof tx.validate(true)[0]).toBe('string');
// 		}
// 	});

// 	it('getBaseFee() -> should return base fee', () => {
// 		const tx = Transaction.fromTxData({});
// 		expect(tx.getBaseFee()).toEqual(BigInt(53000));
// 	});

// 	it('getDataFee() -> should return data fee', () => {
// 		let tx = Transaction.fromTxData({});
// 		expect(tx.getDataFee()).toEqual(BigInt(0));

// 		tx = Transaction.fromValuesArray(txFixtures[3].raw.map(toUint8Array));
// 		expect(tx.getDataFee()).toEqual(BigInt(1716));

// 		tx = Transaction.fromValuesArray(txFixtures[3].raw.map(toUint8Array), { freeze: false });
// 		expect(tx.getDataFee()).toEqual(BigInt(1716));
// 	});

// 	it('getDataFee() -> should return correct data fee for istanbul', () => {
// 		const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul });
// 		let tx = Transaction.fromTxData({}, { common });
// 		expect(tx.getDataFee()).toEqual(BigInt(0));

// 		tx = Transaction.fromValuesArray(txFixtures[3].raw.map(toUint8Array), {
// 			common,
// 		});
// 		expect(tx.getDataFee()).toEqual(BigInt(1716));
// 	});

// 	it('getDataFee() -> should invalidate cached value on hardfork change', () => {
// 		const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Byzantium });
// 		const tx = Transaction.fromValuesArray(txFixtures[0].raw.map(toUint8Array), {
// 			common,
// 		});
// 		expect(tx.getDataFee()).toEqual(BigInt(656));
// 		tx.common.setHardfork(Hardfork.Istanbul);
// 		expect(tx.getDataFee()).toEqual(BigInt(240));
// 	});

// 	it('getUpfrontCost() -> should return upfront cost', () => {
// 		const tx = Transaction.fromTxData({
// 			gasPrice: 1000,
// 			gasLimit: 10000000,
// 			value: 42,
// 		});
// 		expect(tx.getUpfrontCost()).toEqual(BigInt(10000000042));
// 	});

// 	it('serialize()', () => {
// 		for (const [i, tx] of transactions.entries()) {
// 			const s1 = tx.serialize();
// 			const s2 = RLP.encode(txFixtures[i].raw);
// 			expect(uint8ArrayEquals(s1, s2)).toBe(true);
// 		}
// 	});

// 	it('serialize() -> should round trip decode a tx', () => {
// 		const tx = Transaction.fromTxData({ value: 5000 });
// 		const s1 = tx.serialize();

// 		const s1Rlp = toUint8Array(bytesToHex(s1));
// 		const tx2 = Transaction.fromSerializedTx(s1Rlp);
// 		const s2 = tx2.serialize();

// 		expect(uint8ArrayEquals(s1, s2)).toBe(true);
// 	});

// 	it('hash() / getMessageToSign(true) / getMessageToSign(false)', () => {
// 		const common = new Common({
// 			chain: Chain.Mainnet,
// 			hardfork: Hardfork.TangerineWhistle,
// 		});

// 		let tx = Transaction.fromValuesArray(txFixtures[3].raw.slice(0, 6).map(toUint8Array), {
// 			common,
// 		});
// 		expect(() => {
// 			tx.hash();
// 		}).toThrow();
// 		tx = Transaction.fromValuesArray(txFixtures[3].raw.map(toUint8Array), {
// 			common,
// 		});
// 		expect(tx.hash()).toEqual(
// 			hexToBytes('0x2aebb77dc8b68c237297edd41ed9889c3831a40be6b32087f2d0a43efad48bbe'),
// 		);
// 		expect(tx.getMessageToSign()).toEqual(
// 			hexToBytes('0xaad787b6c7cfb13feab05f6175089c95f0b54839365fab43c7c4245bd32b3d65'),
// 		);
// 		expect(tx.getMessageToSign(false)).toHaveLength(6);
// 		expect(tx.hash()).toEqual(
// 			hexToBytes('0x2aebb77dc8b68c237297edd41ed9889c3831a40be6b32087f2d0a43efad48bbe'),
// 		);
// 	});

// 	it('hash() -> with defined chainId', () => {
// 		const tx = Transaction.fromValuesArray(txFixtures[4].raw.map(toUint8Array));
// 		expect(bytesToHex(tx.hash())).toBe(
// 			'0x0f09dc98ea85b7872f4409131a790b91e7540953992886fc268b7ba5c96820e4',
// 		);
// 		expect(bytesToHex(tx.getMessageToSign())).toBe(
// 			'0xf97c73fdca079da7652dbc61a46cd5aeef804008e057be3e712c43eac389aaf0',
// 		);
// 	});

// 	it("getMessageToSign(), getSenderPublicKey() (implicit call) -> verify EIP155 signature based on Vitalik's tests", () => {
// 		for (const tx of txFixturesEip155) {
// 			const pt = Transaction.fromSerializedTx(toUint8Array(tx.rlp));
// 			expect(bytesToHex(pt.getMessageToSign())).toEqual(tx.hash);
// 			expect(bytesToHex(pt.serialize())).toEqual(tx.rlp);
// 			expect(pt.getSenderAddress().toString()).toBe(`0x${tx.sender}`);
// 		}
// 	});

// 	it('getMessageToSign(), sign(), getSenderPublicKey() (implicit call) -> verify EIP155 signature before and after signing', () => {
// 		// Inputs and expected results for this test are taken directly from the example in https://eips.ethereum.org/EIPS/eip-155
// 		const txRaw = [
// 			'0x09',
// 			'0x4a817c800',
// 			'0x5208',
// 			'0x3535353535353535353535353535353535353535',
// 			'0x0de0b6b3a7640000',
// 			'0x',
// 		];

// 		const seed = hexToBytes(
// 			'61cd66b2dcb997b7f4202caecaa6a4cb62e4f41a018d0f073c767c19d2afa6f62d13b7845c6dace5751f1f724e124f72',
// 		);
	
// 		const pt = Transaction.fromValuesArray(txRaw.map(toUint8Array));

// 		// Note that Vitalik's example has a very similar value denoted "signing data".
// 		// It's not the output of `serialize()`, but the pre-image of the hash returned by `tx.hash(false)`.
// 		// We don't have a getter for such a value in Transaction.
// 		expect(bytesToHex(pt.serialize())).toBe(
// 			'0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080808080',
// 		);
// 		const signedTx = pt.sign(seed);
// 		expect(bytesToHex(signedTx.getMessageToSign())).toBe(
// 			'0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53',
// 		);
// 		expect(bytesToHex(signedTx.serialize())).toBe(
// 			'0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',
// 		);
// 	});

// 	it('sign(), getSenderPublicKey() (implicit call) -> EIP155 hashing when singing', () => {
// 		const common = new Common({ chain: 1, hardfork: Hardfork.Petersburg });
// 		for (const txData of txFixtures.slice(0, 3)) {
// 			const tx = Transaction.fromValuesArray(txData.raw.slice(0, 6).map(toUint8Array), {
// 				common,
// 			});

// 			const seed = hexToBytes(txData.seed);
// 			const txSigned = tx.sign(seed);

// 			expect(txSigned.getSenderAddress().toString()).toBe(`0x${txData.sendersAddress}`);
// 		}
// 	});

// 	it('sign(), serialize(): serialize correctly after being signed with EIP155 Signature for tx created on ropsten', () => {
// 		const txRaw = [
// 			'0x1',
// 			'0x02540be400',
// 			'0x5208',
// 			'0xd7250824390ec5c8b71d856b5de895e271170d9d',
// 			'0x0de0b6b3a7640000',
// 			'0x',
// 		];
// 		const seed = hexToBytes(
// 			'f93f7698dded0c29c31485571c90a33978dd15f9013f6488bf6d002715a6c6d804e55bef8f6c1211cf1bba42565b9df0',
// 		);
// 		const common = new Common({ chain: 1 });
// 		const tx = Transaction.fromValuesArray(txRaw.map(toUint8Array), { common });
// 		const signedTx = tx.sign(seed);
// 		expect(bytesToHex(signedTx.serialize())).toBe(
// 			'0xf91c66018502540be40082520894d7250824390ec5c8b71d856b5de895e271170d9d880de0b6b3a7640000a47cf5dab00000000000000000000000000000000000000000000000000000000000000005b90a201fc8d4b046991b32be5b3a2338165c65affbe88d7980f6f3e306ade96b7d2985494d07a2dad2956ffd88816334faaba6d83ede828c3e8d9633a9da3322a5bc0138ed587aaf2b4e0bdf0a6b782f4eef58d08302bfdf761e38a10f7443772c4a02e268756091db42c5cb40ab5adc949839a2dafd746438276aa84a24bf41eebba92e84d77130dff1d613132bd3fe25c0d6788faeb0f1be295bf829f4cea0b9db3defd4e7aa7e1b0eb06fde617f90cd8fd86774c5ff7205ebad164f9370a52d873bf42db8069c615d47308d84799f8590280806907d432025a94ccff5d3788250e61651bd2ec29b845d4db3987480556846867b6dddb518fa51cce72dc5282a14990ae2b840ca306a43624977987ec6b8a3c9452b1e6a0130bbf42243d293e756a943a1a68c056639cabd0046fa4482b454a3162168824440d097c34ff6229a735ad92d106bf49cc4f4666075038d70fbf67f52ab2346f75dda147c1df1bd5c8438802adb56391dabd3de9e618541bd8cbe606de75bc38c21083c0fe601b241956668c9ff9743d8bc21dc37aae229d65a8232879883e85827f3b4479d8826e94fc1a344da719e2473a1a61c34c106905df3ba5c3bcac2aaba487eb176bdc330d70ebd027e6f1c96a56155edc40176309d2c6f384997f81a0ca5f83d0e072a847628a73575b4ebca6020cfd0892be211b359f977f28feee53be1a51adffea4aadd8c01ec7051e1a0a288dbccddbb5a1c1f398a0ba24e4f0a9c7e50cb3b43b9e3b68202f3c3ffb2e906559491b638a883709d54eb443431d53095355b85011f19b66893fe3f8ba49fae41c2047de8b4913f8eb8ab553f3398299a75b91ea1788c69bfacc54dae51433650f0005ebef9eec984c20483facc8e2971590a6e1de4e8ce3138d383350d6ffac1f46f5db73dce4fa41058e0bade24bdcf0e04f196f6a4f3a09726b2b12e9dfbcae680aa7a44bce315ec2b3fa10cef44c24b5eb03bd6509d37f7245ccbb3583775dca0ad21092b53dc7e356f830e49e379cfb149af5dabcca30f1bbfbb79daade2f998f84dcfb6899d4be19df09c6b167ce54fd5979c0accac8a76f45373c5985bcf9e98a1116833276d5183e25ad1da418b87280dc06fd98099832e91f4f86f6e8e3ed23c64856207694aa5673e4e148dbef1768222120cce96b39870b740f1f1f3f423d12edeecabe40ed5720c0d8f5592166c88d2c71a25e94ce2e7b8818348bc7186344556fbc30da382c2579f33e13a8486715556c08a20e5d582f877e288bd6bd38460da1dd40dc934a0cf653ea51578af0dcf720f4d04f1db27ef248737d18a4d00e8833d922c949f27ba2e1dc7b3c8263e6d4522ef426683ac0dc3b0f37a755e2d869bf6ac281a00dde8c7aed7ae361e68c4745384957e92cb136d988153503be8c6fe8fc69385924247c09aae8292c5b039cb4a93b627ff62f8d97a788e7552c40d0ae9a2da39f7788b8cf1640060c99e69aa45e40c44efb056a53af6df882fbbea635500e460f549b808b449a819e7aac950e8006b35df4cd05b4ca2e069c1e8f9b78938adc06e6a430a22319b647b549fda7def53963a37e8bfc7bdadc1ebd49ed669f1cb5de6556bd69f5654ff2301835a6faf4adba1ee4839c255ba4a2a90da391d5576c97c8a2f05a3268518a40c7db8f3c604fe0f1217e777eeb664ccee94a20ef2a0183993e622ff5b719a71c05e2cf091bf9e7b85777a043deae3d1aff0ab71421dcde2b3020331042b2a47a531f5ee4b8a6cccf893afef57f19a0fa972ef92549e3d9a060b0fada8fb79e8c309b3c43e1ba2b0bdfcc0e76516f8aabcc7440f1c0ba097e0b9019321e185ee81beb8be3ea808463a031cc87097bfb82f54ea6aab6fa54435d56e41792ad84fd4353a44e59d94928c12836c755f138a36d06544353488039611bb393eb78fa49fa005f2319e459eb425358f307902c8b8ffe109907800211ddbe0fcb3cd2ec616b34ebe19e6da46c82daaf8d76e60c37c02993bbf73bb35db84ac4ae4686542067f5a56bd873a45d521c1603621856e1654046c52e90bf594df34790e8507a2131f6dad42bbaa80db4d29003e5403315ad1aedcd0c2cc3027fd6a5f06f1087a9a72816a82465371f44ded6f5caf5be571079225800c10ae636fc23afd86705cd1c4686fcc6a0ebe7fe39b863ce1e866d2c065a1cc1c8e68b2ee9868a58e9e6554011191231c5d1208140191c37914f449d73c6e9d4d7258debaac223540bcba1cf1fc8c5be92c642df139264e8b8fdaa7121ae0cd9387bb599c760a7b232879639673cdbaed0882a4b2dba356c87ae15fea69e6b1c6420381da65914bed23484e16759f687b12238099a3cdbc663f81e5eeff17b33d42055c492cb9ca2cc7bec6f4ac9b8f0b58741ac04893f923865a5d81b78bf1a34c81e6e9a5db65c6c2442ad39d4e615b65fb580551bcc4709d86111d393e14fbd8e52dee7d0fcf285195ba7a4e88c1e286dd260ae7ae4fd49a7a578da36692931d35325c190ddf927ff9f9b754a47295aecb67b7dc3d55ef6a051d1afb7b2e13af6d99a948e53b254f8073257d8b1a469b5f3b315fb90e4ae26720b737326e6a62a23548963804bfdb18348d3b1e9d3fda6f9f8761c91f764eaed04a9e5d8ee8d2bbabfdba2d4d45403a96e8c8c1dc6e36ac316f30436ff4f637983cf159e34dbc964f90a46a481cf513b53595d3c7d9d9ac9dbf97ea052cc86358b3a2b59bcacd33b6ad0fd1fbb5e70e5554d2a05a5a90a26a8db2f09382787db2515ba34f970bfc658b1d276efe810a3c5a40b52aaf03b33d5eb47fe2a74f7a404aee547262a22eded9f96e8b3d36f7c0337164aec391ee36d038026d643d935b7fdcd420d27ce92c834f2de98a5d0fda33f61aba80bb5f321bd88b8c7df0513bab316346102f2b7a5942b8ac72c9215dc93d008bf24bb6699c5651da6ef0e00f8f64f45999e2221626e6c10a78e92808310e97089c3f29856d52fdf5934cc0bd3e794d76c06e1a69c2ef126decfa1f19c5b6a8981608a68b78271f30de74bc406a146dd8650ce764cf60d13053a3c6621ae632cf298c9129ccfc3d9d1baf17f66c51abcbd67027befba1ebcd8c82e7056242eeefa282c86de0d311f17a1cac5caa53b0e52af7b35affae36a2c7e6585b55c199c55d31e0cc9fbabfddfbf0026292c0311a4051873b21bcd0bc7e6d2b8f29c93ef300f633381fc21d68cfd04d5d4b2fdfa0bad57226b6e857cec1d7fbc012286684841ab9aaf7e590f319459c68d218d6f41a9b79a10015dc83bdff0918fbcf9ae25c2b78c43bf964a4cf15d5f5a082b5c9634b9ae265afa3ea52be1b1f4c5fb1460a2ddc438ce25e847c0d1ecf166a845d5a50efdeab4155ec13bf9a0b0619b234f20ff2651d5d9c565ea89f064b74b75dbc833376df6140c6693cdb9fe3b67bb4020a70b74566fb21133a75a19d9b6e8cbc90f4a7c99372d6b1d8b3b16f837ca87062f111e570aec63d5bf4cb0727d6d1e942c8033ca71b7d9702f12bee0b7727f50b8af92a7de09045116dc5cbf5f92eefe5c1d0c0b493a09cbebf8ec625dcc7f3f307a7643613d211708c3714ae15c5d6468eb5435d1f6efc95ad5e04c47510984ca9ea79c804b7584d45e4b5f0dd622b0bbadfea3e9523b5ee53d28fd74600b911f3c4626b24db2d8d739a680db1f66a0723bb49c04b6d76a708a61ebcf2e793658b1b8ec6a6d75d0ac8af897e65b6c295a66554b1ded942cebde684cd4f8fed6349939672cc26f1a85018feae6df4d7a43ce3e178363c82e3c78f327a562a42456c512a3bdf78dcd7c235a64b334c61054a3eb8478e05b60caa20978df01f3857fa7963432d8b27224e839dde9fec56996d55fa65870b80579a76651d4d4a2a754eb19b2c88b54e88c99c81bc54c8c7fc922b01377bf4bcf74b537e06b24d321a9a6a09518b6e94e5faee1890aab3ac7e2665c26af20515dac95b4a01badc1cdfacf95810de68c2356e4e2a8380689fb163555342435d6c1d0ae376bc52d36a77be85a0736c882057377c6fe834ef1c9d03fcc99fdbd069893cc0eb64315ac2ad5a409847560df8977720b2c108c8a8c7cbeb9a1b2c7079614e18c2fc00423a4f25431fd1d005d1f91006fe6a48cf792b3b724bbebf2e74a38712ebab137a7c13f5bf6e6c8e44ff64e66b051ebdf53e34b3616fadc2207aecae99d5cd85ed6e6cc6a21651433901b8bce67d20461bf39d5bcb45f03ff960d6d3766d845fa368196c895d501fb2b5e6796a8aa754c63de19000d1f321e95a2c0e3c0bec56f3bc2806843e8220b0983e6a73a28396cef2fcbc4816a8761236dcd3ad1a09030d37f2f5311c4f60fdee00b5cbdf9e29a39133d1c316bb29f0e00f514391ae01938cae87f6b56f45d4b16082ddf4c215e51bea4dc2a2d27d6234608789c1f913fabfb78d5bf690396b9c48260728669cbf3fbe1561948a24dbe22c147b0d7c70ed28ce7b968919f1331279652a2fdee34127115fc20782d9551cf8bda4fe40858230c5a0d13ecbb52351813e94c8bb304962501c0b93999a274def76baf9bf5cfb31fe31658c73a0117e3d693ef0a02f4ba7d51afe144801a25ab90a67a6a3a84a4c767aba51c97607a3674f765c366eda8be4aac59853a85d6e89792c6ce3385d170a92941de0fb97a46ead31d41706943334bec2231c96a6c8eecbf52fe1e20fb269cd349aef04f29153c3d14238aedccc7430a84a1efe5314432835286298192a381e423d04f05c0252659eabc7c22e00d6e3887b1035c1afa83a701621e89ef32ba06a673ab97ab89ab2ad88e857ae0e01ee54b5b8314d6cc82cb6cfb639ea323d4e1a75dd34c65c3d48157a9feb3f9786ebdb4c73da79ba92c8223141200f8c6a3c55343555a0c51faed305fcf6b75906ad2eafb6ff319206f1d7e9ce169f047f3541a3f8795834cf2b4ca2e4d36b225cf2231d7f9f4b7048775e9e6f4e2e53bce525494e76d5a5d389656709681e872107f02fb036338a37f4f1bcc24caf8c93ef594ec9bf7c556ea6ce0e6816e903224fded5dfefaf5b978a38183497c61c023216f13d9abb7d6f0ebeaef6eeadfd807a0407db74328f94eb0c54a673d3dd620efd6cf528e76b19ac9b0fdf99fd2c9e60c2a6bb8da3018329849856ed6ecdb74d24173c3b242c059279e5fb8fb5fb57a4cef4d603b4ed7b0ce0274cbbba0be97729e33779acbd07c269430c738cc4b3384c2cf0f39dceb72a1a6ceb20a64d77ee3f18d3412604cd5a14e84ac3abce7d5b31159bc44293f8bd2e4fc308c51606d6ac550d6c30b89e61ad6136f1ba77cc70a2212c01453fd0cd112b8459f8ea0d81e19de6fd4c793654efb49b0feb09e9ee2fccb288ff2b3d36945aa3d44166559bb817c91bf92781b1b4aabdfddbb61539c166db5daf0fac2602fbc6b2d728373119d3f9503d85861987bf51b1ef2aa6584411441acda44852a9afbb5f9cd74c3a5813fd5d79360fec3d6a565fafab83899d6eec9e38b3c1ad428bb753e50cf63d6a23293aee8f62af97e92f183e09bad4e3cfe2afac47ec4ef2624156a3496ba38a6d22fe0c7580bfc3cb11b0cf948f0eeb8798ab964d5da0bd4257fbf3da326ab687872cb6d65bba790a17e663309a2fc8bc49cee87b071bc5b36c25efbeae5de6ff76dc1454bc52e38ed16b17698d0d8bb5d9ba9019f0bae1aa47f6eb23ed41aee09b4bad44eb8f79f8e54b0346b7bab8faa17a3374da43882e0845d41be5c520c30c0d531d7cdf1e69b0f5deb5bc7e41af9f05b2f83adeed830e6af0f24f4295f7ec16ad03c2c02ad567877544c980fc8df47a96430a5ef20998708ef93571fa35c0701c6f12d83d2666d11df86cde7795c5a35fd8ea0f6b0970eda8a05fb3093b363879a621945c037412ea00b0ae180d0783a44229a33e06d705853de15528b1916f3f5d7d9778d7a184f5f5385591450ab5b9c5a916bae3a90a1aa5ee009dc04026826551157f779e42b83d3544a1d641262c097e163e1c54edc900636a0f7919a7de601bf8ea8d4fc71f80d6d58579853e15c7538b138fac76d183b94c5d61d6b22b634cc8e1cbc04912ed11d038baa3c7bea608f6129aadc052fac030230c8cb209ad6a898a63c941e65cfe073061ce7cd9d602ac6eb2419364a6b92853524abde0d4b34c1f8d7256b032d21a49b81d9b2f8170921522d7854c5cb093880584a80455e0fa455cf50742d1200eb025dcc2d6c8b2f7915064ecfb35142ba4b0ff4f369c46c37bc8438ec135f4ba36ae880b07d3f8fea624a1744ef3d09cbe1a9ffe6b7a05145f2f157d45c1cc2ece50fd7257c0905667c83062196ba64689d78b486a6f3b49262dc1640b70ffc49ccb757d7db53f1f284503a679a55933261254070d56a754bb41b3f5279ff60dab535eec780d62348999b39551a6d80e93d1f06171e93526dbcf54f502b8b1a24771c23d0debf4e30376d81fcdae617f0013a6aa0bf9a60a06b883306927f058a653ec8570b77e5a9b90f8576e3283d5997b4cceca066e136e74c3f19d551ca3cd07a6b7d43fb6c1f25d05d01a98a637329b0b9af03d81148ed1d3e93417a09430c401842129dc4528d0de35c0128de4595d4640d21b085b7ddf74de0ba346d0ccfefa56eff1e969f62cc0a1764d390cd63ad89cf34824a10f72e147fc4658e0ea94d461025b2cbaad58afda0f197d132c40eec9ac2b27dc6c4fb79710d95bffd23154d66622fc454de684e7ee33ea91c6682ffc89909a474e3973f5f001bf7b6824b94308af7e8764bb0416042ee9db4d4ff0f6204840e5d626ddcbc3fd87b67662f90f9abc384826f480f135a7a494ff42e613d00264e939445a925f794e03a7c7dc978f3e7850285f98e651c3939d0c36e04d87f7fa5feac8b131bf18515e0c59e541326221c9ce137a3aa1ccd7436dd2e6f798cdc0fbcda1117512b1f4e96e412cb37524bee690384f3313e6a3d7674b1c0e70b07fbfb51bfbccb208fc75cfd20d7f5e23f536e13eef6c80a87731a6991c71c24967e4bf1b569e40299daaa104764b1f665c93b38368c527c51192bfca4bd7b4203c66eed5d238af5c46291d1b9db01149c3f5287f0ee6dbf39508139df1c11dfc55a195fa27d708635df0dc3a2efd5404e36434ba2370afd008f61973ed8d8316fd7e948c115082a2c9c192add36196dd83cfe59e6917f003634c07bc2777c8c233dc3e3166f1d4c72c81bb6ba81516c87456373aa00a509183c47c0b1c89ab70bf8eff877a3ade0c8e95b572ce3d7e62d2fc27851a33dfdcc67dc82bd0e016bf14e27520a8a076829d7079aa631f4d9da5728f6c29e8984ec491768665660c585972148042b916bf80cc29d80691afd5808005d26914e6730d5ad49cd0b8b569a18676991e3715bdfb5069fd3256e4fc9aa96352ced074ae04969de2bea342b212d96856c13024e92defd2d923a0ba2f98e8b50bd2f69ba8ebcb93236945ca8db95e9c0c46a8543eead062eb6fefe6e95b0e9066d142fc8a8562965178d3dc90d7bc9579e590e52aac9cdb3c5cc199850207cd8fae404b12b64cd31b0b51f3ebc2d3e86d1aade98db4a61bb5b7c1ce1f2bc18e4665bd528f5d3288bae3cce332a67e3f38e6857d5a0873e851cdd78c2fcb03965a9e36eca4694595b58eddad4fae66462b7f54b7a673ece9bef50ee92700f650c5702a20e6a4379d46e5a0092287ff3802116f79d835ad43b57c67c8842dc4de58fe121cdf16e6acc8ecf0c541f98b860342a041f3124e4f477faa016a9e6c1970f1e8068bc2c79cf9ac32ea414c8de071df29fd12c9ec6ee6e2c1e3ddbfeb5bcee71361c7f62c026e9470563ee781db0bcc818534f7ea7a53e01631b3975a66d0cf976e464aa00053e2b8bba2cc8d5c173cfd563969f47dc1793effec9ecd8cd888b5de207f12650d7988b62aa44b15d8a85cd4895097adecf40a62643a4bd76e2a10bc517934db1fa601964c342386cb783aade5cb7974e60f9298e9963adbb11a74ef410d821f23068db6cdf074af56f3139dcc9af127a040ddb2dadfa032b790ceb7d53999fad4d6d5077505e1da15680b50254fbd6f13902b9ce2a0f261ccd7b788020166807e110f98d4b6ec1eb6b21c99df09423f8db3f328ef86481eb354e3768e959a921810eac68579e5a62f2d08d47a1678385c6a0a337ac8f697aaa2f827037b63d49a5ef17211384dc2aac32103651ba0ed4380e20ac48fd9a15821ff8f6f57f1042c9207f32769b6ef21e26686677d7db4c42c478409234b8f35310791842514fa44c39719ed4af8544d002b7fe814d1a628f92b80721640a1fbcd9444f230cd86c468da4f7d2a7c876f7ad151db09e203fec040df16e5026d2cecc94eea481bb5b8f0d373f8e7b2c4e21aeb8c56715ba53ea9d4ce37a79e138e4e96c2be259af9e7f1742f2650fb67a193cb9d1940f743079a95f3f4bbb97ede3c264f5d273970509c3530a019d7550e9c11c5868e10b4adb7cb031498bd89c901e6ce5e1e34953bcedaea9ac6cfe04317327f3d529e6140020b2ad4f7aedf142c920329c3aba230c4aca30d149e33ea212cbaf19a6ff787e2dc1ef8388bb9273858b7964fee06e6b5e370f03c9378a2c751d58761edede57535972ca2b208a04557ceffba711dd6c087786d9e5eabff6ff32e87808f1215970ecb30478dc9599717c87018cfba2f6ee03221100a3c7c8e8fc34a7ddd30278f59adfd3c836e79219aa2e9b0ac58aa9ce6900cd4f5158752283d14946988fa4eacdd5456af1da4ad9b8af66f44083d2f48afddcc2683b02478885314ad71f297d7a609a9ae17bdd1b860abad742dc8f82ea1308a462f1c0b7e3a471329742642adcac9287fead09de0f46df1416bbc699e43172d1e529bd89e986fe2f6f08f04bd53be4546b7622647d09393c97b4b2db77c19287a5f732e0c1b2d5de081bf3ec453cb4af6fb59529c06f78a0a9c8a4c13e862bf92c77453277576fae1a787ac7c267b30076c35376688e53528c4acf8054928f4b310e4a6144d4394ec269eea3bf83e6fd4de5c33810396ee802b243d4f797733922feb25d1e616bdafbc6a192d220ce578af5a6e29b6f13230effef51f8c95bc14e9ec4e4816b5f32797e0cc24e5e4fec09bd766193a738e3c2565e7d0fecb3e51b0d672598daf204136a428bfb3d550204e043923710359bc9fee7acd0c9108efd6803eb8294827e218e9bef2aaafa03967029c3ef0cf540446fa272ac81ebc292fe44d1644b7bee47998f3815d2dea5512d2c6938c74755d1093d17c4f6a4e7ba12ea9515f81f4585730d7299897023bd3ab7302b5d313d16e0d01105e82ac8ca8c48a333667af963a6995b6c1957cdd72fab34bef2460209f6a7cb3052757626b765ac01be5d59f357de690d1f1faf86b0c3e2856211248d6341faf04e7be29352886be9cb4e9fbf44e33745b560d29cec2d61b8008b4282b3590650eb6b73f19e042b8ef080aec3c7b0b97053a47e1207881a063245c31535f298554451aa93a53c438fdaf4923eab7008c0ebc7d838e5925b3a8195b38c99c71c55def5b29b29deb7199a694d2b256a6852f0f9fae0476f7e820f5cd6875837048d479e4c9a06a13649dfbf8472baade7c587ad7c5d09bd31f74c32ab68c68fd41ad88ee290c160340cb6324cdd3c82ae1a61e1a589b967eb61c4d1760d3bc14a818e81e4cc4f4095e3ee067f5d9a94bdde196a84ba738a97163bba543e17db1ce0ae2efad91affb28c6690156346d35168bc2d69c5d966b5e723db05cdf5f7f6429aa7611c3fce775b5e105e843d5e923d9ce6a852fae1c5e84982c6e64c565137775417f0132e30e70e66c140ea93afd6d859ddcdc9d62190422f4fe2a0f3cb6de8f6310cc68078ef6f5ba5cba4a8ed4db8afb1e3b4141b4fc041952ea30b975ceadd39d76e110ba1d686df5132509a80948cc94012e2b1e1991da29663073f31e236e87eb1646d54a02572562d9aae825f26e5d5227d7741bd50375f1cc56dffcc9f87b49bd90ad82e5bb65be4c5ae9934da3eeb49dc35d5cd764a1273849778cb6d535368fc1dfe415173d5c808595a7b4fd41444871888ea5c2dbde0c1b2d658789adae144d6b70aae4edfa0d1f656872dc6069787caac1cbeef50000000000000000000000070d172129313740',
// 		);
// 	});

// 	it('sign(), verifySignature(): should ignore any previous signature when decided if EIP155 should be used in a new one', () => {
// 		const txData: TxData = {
// 			data: '0x7cf5dab00000000000000000000000000000000000000000000000000000000000000005',
// 			gasLimit: '0x15f90',
// 			gasPrice: '0x1',
// 			nonce: '0x01',
// 			to: '0xd9024df085d09398ec76fbed18cac0e1149f50dc',
// 			value: '0x0',
// 		};

// 		const seed = hexToBytes(
// 			'b667ed77674beddf962b6635bb6f087c0d5fc673501d02133d302314942a6256fda678391d0117fc90ef2b7f7d5a5649',
// 		);

// 		const common = new Common({
// 			chain: Chain.Mainnet,
// 			hardfork: Hardfork.TangerineWhistle,
// 		});

// 		const fixtureTxSignedWithoutEIP155 = Transaction.fromTxData(txData, {
// 			common,
// 		}).sign(seed);
// 		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
// 		let signedWithEIP155 = Transaction.fromTxData(<any>txData).sign(seed);

// 		expect(signedWithEIP155.verifySignature()).toBe(true);
// 		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
// 		signedWithEIP155 = Transaction.fromTxData(<any>fixtureTxSignedWithoutEIP155.toJSON()).sign(
// 			seed
// 		);

// 		expect(signedWithEIP155.verifySignature()).toBe(true);
// 		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
// 		let signedWithoutEIP155 = Transaction.fromTxData(<any>txData, {
// 			common,
// 		}).sign(seed);

// 		expect(signedWithoutEIP155.verifySignature()).toBe(true);
// 		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
// 		signedWithoutEIP155 = Transaction.fromTxData(<any>txData, {
// 			common,
// 		}).sign(seed);

// 		expect(signedWithoutEIP155.verifySignature()).toBe(true);
// 	});

// 	it('sign(), verifySignature(): sign tx with chainId specified in params', () => {
// 		const common = new Common({ chain: Chain.Goerli, hardfork: Hardfork.Petersburg });
// 		let tx = Transaction.fromTxData({}, { common });
// 		expect(tx.common.chainId()).toEqual(BigInt(5));

// 		const seed = hexToBytes(txFixtures[0].seed);
// 		tx = tx.sign(seed);

// 		const serialized = tx.serialize();

// 		const reTx = Transaction.fromSerializedTx(serialized, { common });
// 		expect(reTx.verifySignature()).toBe(true);
// 		expect(reTx.common.chainId()).toEqual(BigInt(5));
// 	});

// 	it('freeze property propagates from unsigned tx to signed tx', () => {
// 		const tx = Transaction.fromTxData({}, { freeze: false });
// 		expect(Object.isFrozen(tx)).toBe(false);
// 		const seed = hexToBytes(txFixtures[0].seed);
// 		const signedTxn = tx.sign(seed);
// 		expect(Object.isFrozen(signedTxn)).toBe(false);
// 	});

// 	it('common propagates from the common of tx, not the common in TxOptions', () => {
// 		const common = new Common({ chain: Chain.Goerli, hardfork: Hardfork.London });
// 		const seed = hexToBytes(txFixtures[0].seed);
// 		const txn = Transaction.fromTxData({}, { common, freeze: false });
// 		const newCommon = new Common({
// 			chain: Chain.Goerli,
// 			hardfork: Hardfork.London,
// 			eips: [2537],
// 		});
// 		expect(newCommon).not.toEqual(common);
// 		Object.defineProperty(txn, 'common', {
// 			get() {
// 				return newCommon;
// 			},
// 		});
// 		const signedTxn = txn.sign(seed);
// 		expect(signedTxn.common.eips()).toContain(2537);
// 	});

// 	it('isSigned() -> returns correct values', () => {
// 		let tx = Transaction.fromTxData({});
// 		expect(tx.isSigned()).toBe(false);

// 		const txData: TxData = {
// 			data: '0x7cf5dab00000000000000000000000000000000000000000000000000000000000000005',
// 			gasLimit: '0x15f90',
// 			gasPrice: '0x1',
// 			nonce: '0x01',
// 			to: '0xd9024df085d09398ec76fbed18cac0e1149f50dc',
// 			value: '0x0',
// 		};
// 		const seed = hexToBytes(
// 			'6ceb777233924a448307a020a2fa456d2cd706fa3b2b42350315f005af3526eb6bc965300894660119a748fadbbcff82',
// 		);
// 		tx = Transaction.fromTxData(txData);
// 		expect(tx.isSigned()).toBe(false);
// 		tx = tx.sign(seed);
// 		expect(tx.isSigned()).toBe(true);

// 		tx = Transaction.fromTxData(txData);
// 		expect(tx.isSigned()).toBe(false);
// 		const rawUnsigned = tx.serialize();
// 		tx = tx.sign(seed);
// 		const rawSigned = tx.serialize();
// 		expect(tx.isSigned()).toBe(true);

// 		tx = Transaction.fromSerializedTx(rawUnsigned);
// 		expect(tx.isSigned()).toBe(false);
// 		tx = tx.sign(seed);
// 		expect(tx.isSigned()).toBe(true);
// 		tx = Transaction.fromSerializedTx(rawSigned);
// 		expect(tx.isSigned()).toBe(true);

// 		const signedValues = RLP.decode(Uint8Array.from(rawSigned));
// 		tx = Transaction.fromValuesArray(signedValues as Uint8Array[]);
// 		expect(tx.isSigned()).toBe(true);
// 		tx = Transaction.fromValuesArray(signedValues.slice(0, 6) as Uint8Array[]);
// 		expect(tx.isSigned()).toBe(false);
// 	});
// });
