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
import { RLP } from '@ethereumjs/rlp';
import { hexToBytes } from '@theqrl/web3-utils';
import { Chain, Common, Hardfork } from '../../../src/common';

import { FeeMarketEIP1559Transaction } from '../../../src';

import testdata from '../../fixtures/json/eip1559.json';

const common = new Common({
	chain: 1,
	hardfork: Hardfork.Shanghai,
});
// @ts-expect-error set private property
common._chainParams.chainId = 4;
const TWO_POW256 = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');

const validAddress = hexToBytes('01'.repeat(20));
const validSlot = hexToBytes('01'.repeat(32));
const chainId = BigInt(4);

describe('[FeeMarketEIP1559Transaction]', () => {
	it('cannot input decimal or negative values %s', () => {
		const values = [
			'maxFeePerGas',
			'maxPriorityFeePerGas',
			'chainId',
			'nonce',
			'gasLimit',
			'value',
			'publicKey',
			'signature',
		];
		const cases = [
			10.1,
			'10.1',
			'0xaa.1',
			-10.1,
			-1,
			BigInt(-10),
			'-100',
			'-10.1',
			'-0xaa',
			Infinity,
			-Infinity,
			NaN,
			{},
			true,
			false,
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			() => {},
			Number.MAX_SAFE_INTEGER + 1,
		];
		for (const value of values) {
			const txData: any = {};
			for (const testCase of cases) {
				if (
					value === 'chainId' &&
					((typeof testCase === 'number' && Number.isNaN(testCase)) || testCase === false)
				) {
					continue;
				}
				txData[value] = testCase;
				expect(() => {
					FeeMarketEIP1559Transaction.fromTxData(txData);
				}).toThrow();
			}
		}
	});

	it('getUpfrontCost()', () => {
		const tx = FeeMarketEIP1559Transaction.fromTxData(
			{
				maxFeePerGas: 10,
				maxPriorityFeePerGas: 8,
				gasLimit: 100,
				value: 6,
			},
			{ common },
		);
		expect(tx.getUpfrontCost()).toEqual(BigInt(806));
		let baseFee = BigInt(0);
		expect(tx.getUpfrontCost(baseFee)).toEqual(BigInt(806));
		baseFee = BigInt(4);
		expect(tx.getUpfrontCost(baseFee)).toEqual(BigInt(1006));
	});

	it('sign()', () => {
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let index = 0; index < testdata.length; index += 1) {
			const data = testdata[index];
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			const seed = hexToBytes(data.seed.slice(2));
			const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
			const signed = txn.sign(seed);
			const rlpSerialized = RLP.encode(Uint8Array.from(signed.serialize()));
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			expect(rlpSerialized).toEqual(hexToBytes(data.signedTransactionRLP.slice(2)));
		}
	});

	it('hash()', () => {
		const data = testdata[0];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const seed = hexToBytes(data.seed.slice(2));
		let txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
		let signed = txn.sign(seed);
		const expectedHash = hexToBytes(
			'0xf1e0e9a7693c947198221b333aef12e950e07d406d489b02acb94f085f34efed',
		);
		expect(signed.hash()).toEqual(expectedHash);
		txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		signed = txn.sign(seed);
		expect(signed.hash()).toEqual(expectedHash);
	});

	it('freeze property propagates from unsigned tx to signed tx', () => {
		const data = testdata[0];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		expect(Object.isFrozen(txn)).toBe(false);
		const signedTxn = txn.sign(seed);
		expect(Object.isFrozen(signedTxn)).toBe(false);
	});

	// TODO(rgeraldes24): 2537 eip not supported(merged)
	it.skip('common propagates from the common of tx, not the common in TxOptions', () => {
		const data = testdata[0];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common, freeze: false });
		const newCommon = new Common({
			chain: Chain.Mainnet,
			hardfork: Hardfork.Shanghai,
			eips: [2537],
		});
		expect(Object.isFrozen(newCommon)).not.toEqual(common);
		Object.defineProperty(txn, 'common', {
			get() {
				return newCommon;
			},
		});
		const signedTxn = txn.sign(seed);
		expect(signedTxn.common.eips()).toContain(2537);
	});

	it('unsigned tx -> getMessageToSign()', () => {
		const unsignedTx = FeeMarketEIP1559Transaction.fromTxData(
			{
				data: hexToBytes('010200'),
				to: validAddress,
				accessList: [[validAddress, [validSlot]]],
				chainId,
			},
			{ common },
		);
		const expectedHash = hexToBytes(
			'0xfa81814f7dd57bad435657a05eabdba2815f41e3f15ddd6139027e7db56b0dea',
		);
		expect(unsignedTx.getMessageToSign(true)).toEqual(expectedHash);

		const expectedSerialization = hexToBytes(
			'0x02f85904808080809401010101010101010101010101010101010101018083010200f838f7940101010101010101010101010101010101010101e1a00101010101010101010101010101010101010101010101010101010101010101',
		);
		expect(unsignedTx.getMessageToSign(false)).toEqual(expectedSerialization);
	});

	it('toJSON()', () => {
		const data = testdata[0];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const seed = hexToBytes(data.seed.slice(2));
		const txn = FeeMarketEIP1559Transaction.fromTxData(data, { common });
		const signed = txn.sign(seed);

		const json = signed.toJSON();
		const expectedJSON = {
			chainId: '0x4',
			nonce: '0x333',
			maxPriorityFeePerGas: '0x1284d',
			maxFeePerGas: '0x1d97c',
			gasLimit: '0x8ae0',
			to: '0x000000000000000000000000000000000000aaaa',
			value: '0x2933bc9',
			data: '0x',
			accessList: [],
			publicKey: '0x1de9c19823cb94b05ce8a3aa5377e8332c9b2223d6e42d8cb9818c3fed182c667c401160d9e2024e6651382851e120e1fbff1d7d15a4596f626e61af263fd753ee3f80ca801682d7189b2c64bf3acb1d676033e49b432fdff76af56beab1b1e09a8269b4c2865aa9f603e6f53706b849ff1eb4219469fef70eca55d2786ff26373ba730ecd7eedeb77e3a8eee780da5393312446da09883f1db34e4b8e695b3f38b8b2c642f4d067194b2b7b4eb87250a29bcc49140dd41da57e9193531c0d0630cbe8830ed8a3f4ae6b527e6ecdd04b27f808823a5d8e564b6b9164f63f9553d0afdd8a8724c93ee8c4d6f700a7e069f4471411ae0aafffc312f94b1f3dda9eafba18d2551db4689cda39c6170448f8107edf97c13cb1b65cff5817aa62658fce4e4b5b15ac633558b803f73c9f3628faf7129bc4a4fa80b42b2ca162f8c2e37054dcce634aee3a411db807740939f381e40996ed7c2f683e20ea421fd535d046658d55843749b547d1f3ce9bbe51ba10a30279261bc4d988fad5c53774a2fb06718507e7b3f20bc0f6f030c07276e3bf45caae9a30af29f7397c1722c12051ea2f941a90783e38acfbba892ad63637dc113c0b354253e32ec71ade86d4f0890661ab1506e544576df4f3ef32ff0a15182ce7a178c6dbc1c5a536c6d6e61f1c7f860cd0fca797c929681329b15162933bcc7eb28e57f4a2e7e195399bc917e764218a74f99f7bd5180284d9e5f2fd5651158748d289befac922edefafe47c8352b9f9ed9a6b7639f5c1fbf31423dce815156696f0d3c582fad4af0a3711775ba93cffe3d8dc0149a2ae217c55a46452dd3dde99a1f718185b03833c1ed8deed4ab1d6ad20479229b37b687a991030962682d1ba1f430c2f494dec8a68c482e0c9181655d6eae7ef50f691319485f4ce08ebdbb87551c82122934061024b7619a96f849f484fae363ffb81e655112b7ebaf95d29311e917d9ce3fa0cbe73b8b982df394d43af1b0ac8ad6bab5583cf993d0101fcf1b34682f89d21efa189c8309f1a4d625edda4ae53583de2cd3b38e0e266ed313ff5fea263469ed9e9bc18c859dc97f6398554a7e84b6e7d4e980246a1107eb993a7d84a17d06055c3ddabf62d75fd917b888bf7a8bf232dc0960eeabebb6a87956f6905fe5cc87a964cadc71ae60f8a44264603559a2ca765c6a736a2ee413dfb00a4158823bf8bed5c3af1eb88367b1586d9695349c2ef61f227db765ad473172a835058dd03109c6fd2a3f22da9eb52cb3fd2d5bd4fb40dd4f6a743ca7b20b80937f828f726aac0f90981ac94b18ef2ad5c90d994d386d477deb4ee23091b6c87e26818e6ac634333bce48930a6fa091acd4c82048c5425c83f5d5682f76e20daa2fa0dd6e69af57b3731d1bfb89e6fd39790ce3300e331349c9925c05b335d813f933b9393622582e80ef2f0027133860191fda6ad963de03b6298cfcacf775e58f1099b68408a93835739a96696f36c3dd495c276f8a2f3f8ef972ccbff82a4ea46ec12b2f87571b0b213215548b914d055ba98e30ac9bc6ffb31ca8c4ae7219a69608479b96c7c0a600034d49589a63ac1740eef6994f2354fa7ace3223a7003b99288f397ab6a2497db78b4ee14d5716be55ff9ec291408e9e756c08092e2d8f5f2d994f0bf75d4afbf5b8a9c217df6982b64933c786dbb21d9a9ce4c5532572213922f750ccd9c8e5e08d578a2144240757adbc1bf53581f1ebd54dafe48a9f7102f1d87ae8a346cd4621392c589f73bc94ba1a027eaac7da1e29435398de3a354235839010bfb9fc711be2c84693f550b148913f3a9de1ded6ad41b0eeda1c8ea8eb5839a06fed3e36b7e8a220a5d5e7efacbba56a585c2664483ea68c95e42803e131240ac27499252b7dc5b06fa71b91662690979c5d8ea0ede78a801d6cde3b29aba83c3fb5fabbeaec63871ba4cc5772bcd7f97c78b16170e13f49dbe116300548c668dcb61d798dc834ff6693799e6ffe6f3b32f4f2b71349e301768e2397f904f045384eee863120bcc1686637dfe7152a2afaa1dabce08c8f16f8fd011e87268eff9e16f1bbe07f0bff3e23355d3c94767e8e43bc35bd632ce5fa1f6f983d4b2c1ff9bb04805395b006098e29c0d03facd9dd77d594fbace0ed5212e76425fed9dc96ad4191f6ffea72cd299d0369e1e7534b7585a9a35f430d86b00ded922a9cd2db891b7c203a01355dc78676390bf41598e0ef9be9ff9218f28e417061461d910fef22c3499002299c4fcef26e8352f5ccd036c91b8784205cb3f3c2e0aecff18d89faa59b4fb0cf4ad453be3736d2596bd739013fa8c75bf1e848865952c300be4d0a80f5dcb80d3cfd1f3f3c83a123d3aa471b17c7ce1c7ea50abbe5fe397187ff52438af55b5b64cd8f9a3d021c443d8ccc55befb1c513ae8afab0d5b1bb4154a09b50cc0a4605162cde421fd6e3003cab82cc8ec3ab7ed5d98ed7222d83e00cb61d3257c6503ad52f214f1e5a756ee9d4d4fddfc09d73b0a1378b437456a7bc42d9d43f916ccc61ff126a50841484f0f9addb261f38ac75d7dfcb0435fc4a6092e85d6ac4fae064e95870b0efd4269681099c2bb743773cfc61fd082ceb27c95468193dc1773b31906e638c9928c2d0a57a77e0d4ad0e77e703cc099be8a5390dffe6c4449c72036247db0a76a6899d6046eab2ee121e5d65540ede74eb76cc4bb2438edde71b126ec6be88a54f9981060dd8508b0f635938916f7bf3cba7a104c59b816f3c5256a11e1704c03461d0e9e22133b907dbf1edcc796c2daaaa07c42a01deacf8072a4b76cf060d386b0e0f30546811d03df36238c28c568b900777309c8d2c0e5c711c12820e96626dd88debc6e80c8e0627aef80acdbfac556abb17b91a4372aaf6eda4ce114ffb9fa1d81aadb88099dcb1ad953aeabb48611716aae98c8fbfbfe30d6cfa3e15a409f5d754bf1c2602e2f467cf32133a53929df8d34112871c66da00c7931fef9351275206acb60b6848db36360af2643b7cc793df85fad6c3b4201bb7b2ff8327ae8efaf928a2ba6c36eefd912f015f494a34656bee438f9a9ead1128e03e9b8a6fba651a0e0f0e6f043cb78f76ff2ed08e9796317948f5ce6b4c4fb48c5f5f6a79f2c576f0228be0da8b468f449deb3cc0a9319e02c2bf802eebce51d1019ebfdd7045fdb8a74e108edec98610e6ff95db9af4be713cf78d1a8f11baf81d7cf02e7aca5ad389acdf474490d86abb23acb44c319b2531d2d97024ad5454425ac803c40f19b382bc8e0ff277788e178b055e0a5908fe212efc62a8f86354e3c1a0a653123743b9b7fd7115bf16e4c12b233ff8122513d8bc09ec3a561dc130a901cf7d7ecc43188494bbed9813114f0ea79e7817be2471f437d395cf23710d40573f328490ae37454587173817b7ce18627b40a662dba0bbb9858971a505a0786a98526e49faf0d7aec553a3b74abf28d3c92106ac3361845d49a4a668d743e202ed690171a66575897531e65b453f2b016fc26e94412d07dc5bec7b72d5f2187893f297add3a34daa3a074c40af5f8f8a32d0e3e501e77ae14800c5a96202790e9ca6264d9d31bf4d251ed8c76f42c2efbc8628614fa41942081e281878a1c81b2d80c3e6677fd6e5f9bc016395e6247466240e',
			signature: '0x1e402bc3ca44e1e7e812865158f22a0e70f9790c6740afb514511bf908ee9e51deab654abb7f3a044934aaa0dc3d09c369dd6a1df0fb2c049130228dc82c4665f7fb026d516d4da5c7e08a601ce81f451e23283804e7c0960acddc202b6a52c4452015d64f3e480a0cfaadb7c5946318226ea172573c4a2ba16ed08c1bb91a77d3cf666895d90af09f37cbe322ef8a5ea647820cbfa04073bdd73522e9f4578c44a13e695f961c91e7b40f75c837c9cc9d5035bbdeb7a07518f8fe28583ae5d24a2e2167ee14f1e6ba9a7e59386b5639a550d918bae1f611504024b61deadd076680a315a5b63dd354b5cb462e9a045abff82077ec6c80e8f6842577565f3e10791cc324982aee8493d1cf8054f24e1d73e02604326593c4f210fad2cbe4f93993348af27c62a17b9ad1bfc92bdaeffa55d03187c37f95a0c92ed1ca77d8fb3d60abd6d6fb40545e634a0cca26134b262967b5af1285ecbd5fbe40bd33a15fa09b99bffcd7cea10c9d74ae401e2ba42fa1d3472dd5a7c772da3a7e8b49fe544569bd48a4f0d0194ce9738f3a4f3b349b997b5821e236fabf1739f1266893ff275ad1cfb090f216784d79200fdb10b3bfac7d92106135ba34e4bb00ee6252b90beb45e442eba2f9b8f5f073f9566ed11fd3afbc1b0d30248cbdbba2759ddcb2598914144b4c24ce3ff7c45135e7b251e4663123da99612813e920a209f2420f2f3ca56dcff7abce627f848acf70fb91ff4f792ab33f171c3fd2303cad7736186b805de5fb376739bff9d91d468d6306a623ef9b5360d3af8d55a11b9c984ce91a158e82108d0f174913ed567ef288c2b5dbe65f8c14f3a4386045814e0d432b17b13ee35408a2f934b76124fa0224d2e7fe0c3ed17f658c7503334b01aedf6fa24b3058fa8103aa247f5263098be603ee1f286b6df3f166a9fc27f8f5fb2f8acc464a3648e58a5345f949dfbb9a77615fce9738ceebfbaadff08d80e908a7d390a2f05745eedd67bfcf1dfc646337ff9db80753492800c9a0b6b22afcb4e4359b4aac9d8d19c2862a9f9430e5c75840ae2c9391c95336abd24b0f7fe12418c65969e7f6feea1da6e95acc73216e69d6fd0ed9595811150c25235fabaaccbc2d64dd63ddfbb8239b8481082b49ed28dad8ca3073365dc9159259ee178b4a192a0ec1e2621a9ebc710b20c4d176f00031dd807cab36be29ff5b7785d0ca066156cd5e9a4e4f14d3d073689a3ea6f9db3a7e51b30968f0f6cb949f8a689b3a4f3617c13519fc478b52ce134617361b327bde825cb4f6df785324cdb238b526538875761dddd2f45055cce869942c8f9117724035611c3cd3caa61f3960cd0d1292d26145fdf90ad85252a58af0ae4541748cbf13b99d0017bd5f34787d117d7a7a40278f43b5a1ac021bb7c415ea4fa7033e4d2b0d3ee6ce26d9642ebbe910d5ff7639b70e377f133ca43ca0069b2f996d27f694f935c9239cd2d74d1023e820a453d25ee0dd37c50d98dac08184b1749ecc877a8b3e83ac50d395d631874a5b51a9e7520929636583a3a8c3b8ea0c7a81424f834970c369348b26179f0c5663de1e62df1de5bf464318adaced1a6151bc73ce7c7885b0a3210ed1056d300083ae8030ff3ef8f653284b7080231cdc1c9e90fbc864f06460bb54de044930118d01e285f9a297c6ea3080241ee86b29c46e53392f149aa7d06d3133cf0995733f3f1c0cd5fe38858d9742ebd73b8d9eaf333b6440e9444c0a1618041c087863b4c222382e4551464b7166a3738cfb73015782a2ce3547efadece0f864db371a807fbaa7378047685a2c32def9c3a60147fb1bb536301edc0bce29fd06871f3125da6f14157457d6984d22e1d80e788bbe957c061f8cf46c1286f064447b597e7b0e63d16461bccbd08d5f306ec1ede2f66988b1de22700f2d0e9d324b612709ed7c9065920bfd179d83d444dcd27c370e75e0bcbc902b8873b3ddc66a35e42d1f2201441b73c68dfd211e52cdf249f76a3a8bc8224e0ac2d9c3eee48f29576900573f6e07fd728045443263612fb4eeea90847de0577b1a035ff52b9a25563f797dd0d58013c349d9735a6afd2bf5c7804a5e9827c41d56765abc198d96315e4afc442404a6af16f6c6bc4f27010710b75470d8960090476f96db76f361ba929b5c518321bdb1bf84375603774e663da29afd9e133fea0f5828494ea1cd59e8bf9ed5cfa5cb6d9b010eaed3e3f39029e3a4dd489941aa297c4b56aab66536cbec4abe3cedbfa82da3afc633f59e1b77680e123e0723966ae420afe2ed5c7ea15a86e3ab1b5168ee93637e965325e23bf07babf2821ae3f30799e5cf5d0572ce69860591c9e3d3d27c8f922e22b64f054827ecee8a30bf855098cc09a648d80117c4e8581692801286c22f2d4da0a7ec9769ddf530861a6673cd3b9bd6117bb2c71fee31c4713a73208639c646a98575cafbcc3cdc42746c32ef7aa24374a004f867b29cdc384c106ccd6a7f2fdcda7fdefa7df338092230b4a8ea6418e912b5609deddc3d602ab077c73273699e2cdf690b1b032a358b31a093aabb6fb93112decfd8c804e0ff2ad6c08ba6d33f8ef11dcda054a4a11f5d34d2378c8afe2aecd4a1719580fad793e2c31a4986b1e44c0bf7f838ccaaefc3ffc01ef0607ce532aca3f0aefc2bf545e1bfddd86fdc3e5569c974b978b434e2de9fdf820a4b547759ff80b36417bc5d69a52d195f9138ad6cfbbb06f992dede9e6d78ec3b9a3b2eacbcd45cfa3ea9da25d21cf55184e8bb6c7b4dbea7e2d3ded4fffbd4738da7367743c6ebd023498edc558f5143815094c6f6d2118ccf9b9827da40d8b27a1f6bc1ae43f5853458828bda54e58014de4a0cb3709d171370aee1a0c619567a0dc9103b92125666b37d2b45b4b9b0f25c15a6360841aa31804b756e617f3403c92d5507876e1c14aa70fa517fcae97b6018d934c9026c9799fed157417dd6f30527444967e10c47b39c1327643fab2c029804f23c1b051f41d8ccdf3c3acfd569750bc78e0396d3a694a7410a9703302bbd1c58e3507de5d56357b1590f563b2bb0bbf7048caa3fc7c89ea501d929d23c40776744f2fdd97ffc388e3fbe5640aee6972d8ec830408ac6703cdade9e329944dde141ba394f89786367a5af8a994702a2585bae24c23b8e772a42afa92b4d8ce1b7aa372b562baaf63977b34449f7ba4dd1b906a58e73045fcf5160adc09dcd360818694da9974dbb6adfc0f7784c1d31b6bb2bbbd914cc311981355f870fc1d90804da3bdba640f8c70878fc21844a4ce6e2b714598adfe415d67d7ee95983d8fbf28574390c5a2ef99076a428a62e4fbeb1218b09d3978416970be19347597c8d1c8b43bf9bd6f0f67e6fd9e935399e36b33e34717b9130802de354a38f3d4b7459a82c1d729fd52747ae8785534d24d3e5d870bcd004bdc8978d06e2c0c0e4135cc6dce11330ca0bc407c4acf5e1a2ecd033a485fab5db4fda5d51710da72a49240dd58fd725c6f856b0ee2bc07f8cc473c29376ce08ad9c1171d09bb072d432a5e0d15a9f695c95f2c7d2cfde9b3933e00a115fe6f3e446ef5cdd5ee75bf2c89e40a1bba154af228127385855f20916e9e3d47567b11d28b2a17140dfc7c014e70052e280f6f4f841aaf81d66a3c7740c3834daff8f65860ecef9debb7452a366ea77c42742eb9bc3cb88bd67a722794b3e85b501bd26ed9c2ff502b5b76a8368116fa98c67d2d9b74ea65bebe773342b87b2da8508a31bbc76d8c5a9c58b1ab93ced437c3a3570aded7fcd85eddb1d6d46080cf76c6fe719a67ad2585ef4f7f2b533350117b07cfc22c0b2b0f557b991d256e0b56844b8ca12dcbdeae2c27a8c0a0cc0e95fb4721e3df4a0ddd3429614a9d3aa023c78ae7c38c6c553072656ca4ecbc95c9785d6693973c8bb304caebc981b803923de0467d16714e5fd1b001999ef61f3919a3e0890ea6ca187b8ae906f9b57f33b6b21353cd9a370795db6812de5cb8a791a8963f32cbafa55f7dc681e345ff9c6c5675145e4b256fe657566a3e5f2d4eb0ba2c2adc407a0e2963fbdc6b8a880842b1d96932ec5f20ebe947f59e78d0f8aea5457df67db3162b464e37620d8cc04eddb68d020d019dcff85318e4ec4c025fd98e30933cf9ebfb9190a3f26e48e2e170bebe49900a763f3de7cd965556956e2a666c7c3d711bac457eb323287a033215f7161c5258b49f207d3c888521ca23a6b0c62cbba5d149916dfb0c5b81aba26f5e5cd21d574211d375020ba1b8c82abaf243db3c5d570aee4f4f455ba3efafc554bb8c263023dd741864a06542336239cd26a230c09280fc780fa8a0daa120b3a36e804c37cc5e927ce798246912f5bbe2ac9cdcad6d4a287ab875bef8e296f1c2c455511f2f440aa90a7868b4de594926a83b62cbeb338ae0b3f8e01d9bf17055d9c9c054dd4a73be3dc111810653c71b84a5c9bd7bce98e6e533aa40343396c9ba6b81e0b91781573ae9326213bc7e24064af7b9cd75f57a694cc111925c049d8f5e973e61a3600f6211a7144841cf13a9177b88f5ec41ef7b2c5cd7e06f1ceb494c4147283f629b8f31462b9d5c19c22fb652555c3bc3f500adb5117ab7b8918117b2a7c137e7325cd9aac85ac98d55cb55429fd61c0bd8ea858c1361dd269d2d461173b4e24ce02bb8d30521fe9f407d9bc17cb37418f7c9e4443298b92891a1d5fcea1361dfffb8db2aa181c8f007bd0163fd52b75b23bb66d99697b87eb27288cbc337372850f5458e364ab6646f94e17322ddd8d353c658fb4d5d29d84fb55acd736524c2bbd0edb0a6846e64aa7d77c6008614275b4435b38a3fc83eda59ee92a2d1e86059055eee97a6d5729b2a6bcf226c89597a370ee1c9f69bbd36cb5f36571f24d2742232f17a9d43524b5bdd7e17230e8efccfea3444216eb8870041798472c783a37c1fceb2f5be779ced9e328011476bbc9521557141512585ff09179c36829fdd9f11353faa2678522414304d857db8270ef918c901052ce190a3741d48536258c435275e4ed472275725569802fbeed0fe23c101a55d4a56d7d848584308415a06e6193f281390f95b4ac94249797a15ab2cf965ededf499a2dcc03705e50abeb21c288c505b4a7016e213818fb1d4b8c202f6cf84789956a5759c43a796838f2c2d720de65a11ed7d59cfb3342478db314084e57344a22020abc19cbf65d7c96bdb51a491acd2b92daeeaf20965ee7cad5166d4a20305f9fd439189d8a58c52dc34bd88e510fb810024963907d4fbde5343b978f3704d4f220b63e08b42599b2d535dfbc61f1b5705266fcc5e3eee37d4adbe6ac8332244c5cf52044e3ad63c38b9f6638fe06bacaa0178a3d5a553a6d49a561f21377690f1d14a00dafba76a9f154e7e27833c36261cfdce2cfee34e138fe346198fdd8fe6bcc6c5d34b88e77105757789ee27b7044aa8e05799e1241247cc744a31d556f854537e9af81df5ee9ef1c830b27e37d94b58b57f157866445b7aa324fee7916711e5227a9b6f7b14d3c39a60145bd4641f37aca4ee2b7bf9ddfd0b085cf4c42378090aa870e45d05b5dfbfe15ae6d6f07a7350a7c24bf4f90c66b616ef28f368b06a4dc1d12a4eaac07324a72235a6d6ae9dc48c1c80ae18c76d1364ad2a9d2ae4572a82ba2ef8aba40cc356a3fbd3054a7bf07fef0cd5b1db775c48bb5ec94e246b75b477bf28aafdaeb74c606e3e8b76e546ed7ec882d203078a3b982064d8ffd6bddd2225dd27ca7e5e9cd62d832a82fd61427845b5b8fbae90bff21886a526758d83de838234f93e603148bfad389c1bfaaca7b75ee6586b0c9147bdcafc8320388a24f9fc43b467d4d868710bc639888cb2a8d6b433333a3dc6a31464272e1aa0fc04491ff89ee5be994111c8781a706d80171b4ecbb86cef31403641d2071ffb8f297c814a63390cc4ec32f702913a7c08d92c1001441e3149aa4562fe663387cebd9d1ea71af1f5c14dbfb1733c2b1027381e56eb7e3d3768d1c6a2f29d53362947952c3a8598f67def0de814af7387ac6e558d30ba793f41c4008b3b9008337cf0f504a90041b884d4cd73695e98a622adb0175cda0bda6208026902113d11776eefef5c01f941fd4ae6ce6128e77882870a702c86530ba29c6df95183855cd5978b89a68fcf35bf075c98400b46eb419a098f4898e2738cc929cca9836f3140eb1e1dace42ee9c0ed46c93315375a581fbdda4ba065d1a5994bd99a124c08e3514c12ca411f18c3d4cdd2afed764bf330c5fe8f7da73117956c9f29ea6771f80cfea4658ca422b47bec6a7ea0a06d209cc8a8aeb4c81c68e6ed6aa1bcdda3453207e32efcb974589aff889543087c384d618d70135485f607b89b0b3ff838eb3c40b283f4487ddee094a5e8dd3f4555c6f7789f1f301091a33364d58dc18236686b0c8030f5a7e9196cdd8e7f400000000000000000000000000000000000a0e151b222a303a',
		};
		expect(json).toEqual(expectedJSON);
	});

	it('Fee validation', () => {
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: TWO_POW256 - BigInt(1),
					maxPriorityFeePerGas: 100,
					gasLimit: 1,
					value: 6,
				},
				{ common },
			);
		}).not.toThrow();
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: TWO_POW256 - BigInt(1),
					maxPriorityFeePerGas: 100,
					gasLimit: 100,
					value: 6,
				},
				{ common },
			);
		}).toThrow();
		expect(() => {
			FeeMarketEIP1559Transaction.fromTxData(
				{
					maxFeePerGas: 1,
					maxPriorityFeePerGas: 2,
					gasLimit: 100,
					value: 6,
				},
				{ common },
			);
		}).toThrow();
	});
});
