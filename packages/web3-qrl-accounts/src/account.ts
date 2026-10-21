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

import {
	decrypt as createDecipheriv,
	encrypt as createCipheriv,
} from '@theqrl/qrl-cryptography/aes.js';
import { argon2idSync } from '@theqrl/qrl-cryptography/argon2id.js';
import {
	InvalidKdfError,
	InvalidPasswordError,
	InvalidPublicKeyError,
	InvalidSeedError,
	KeyStoreMismatchError,
	KeyStoreVersionError,
	PublicKeyLengthError,
	SeedLengthError,
	TransactionSigningError,
	UndefinedRawTransactionError,
} from '@theqrl/web3-errors';
import {
	Address,
	Bytes,
	CipherOptions,
	HexString,
	KeyStore,
	Argon2idParams,
	Transaction,
} from '@theqrl/web3-types';
import {
	bytesToUint8Array,
	bytesToHex,
	fromUtf8,
	hexToBytes,
	randomBytes,
	sha3Raw,
	toChecksumAddress,
	uint8ArrayConcat,
	utf8ToHex,
	uuidV4,
} from '@theqrl/web3-utils';

import { isHexStrict, isNullish, isString, validator } from '@theqrl/web3-validator';
import { keyStoreSchema } from './schemas.js';
import { validateArgon2idParams } from './kdf_policy.js';
import { CryptoPublicKeyBytes } from './qrl_crypto.js';
import {
	addressFromPublicKeyAndDescriptor,
	newMLDSA87Descriptor,
	newMLDSA87WalletFromExtendedSeed,
	newQrlExtendedSeed,
	qrlSeedFromBytes,
} from './qrl_wallet.js';
import { TransactionFactory } from './tx/transactionFactory.js';
import type { SignTransactionResult, TypedTransaction, Web3Account, SignResult } from './types.js';

/**
 * Get the public key Uint8Array after the validation
 */
export const parseAndValidatePublicKey = (data: Bytes, ignoreLength?: boolean): Uint8Array => {
	let publicKeyUint8Array: Uint8Array;

	// To avoid the case of 1 character less in a hex string which is prefixed with '0' by using 'bytesToUint8Array'
	if (!ignoreLength && typeof data === 'string' && isHexStrict(data) && data.length !== 5186) {
		throw new PublicKeyLengthError();
	}

	try {
		publicKeyUint8Array = data instanceof Uint8Array ? data : bytesToUint8Array(data);
	} catch {
		throw new InvalidPublicKeyError();
	}

	if (!ignoreLength && publicKeyUint8Array.byteLength !== CryptoPublicKeyBytes) {
		throw new PublicKeyLengthError();
	}

	return publicKeyUint8Array;
};

/**
 *
 * Hashes the given message. The data will be UTF-8 HEX decoded and enveloped as follows: "\\x19QRL Signed Message:\\n" + message.length + message and hashed using keccak256.
 *
 * @param message - A message to hash, if its HEX it will be UTF8 decoded.
 * @returns The hashed message
 *
 * ```ts
 * hashMessage("Hello world")
 * > "0x8144a6fa26be252b86456491fbcd43c1de7e022241845ffea1c3df066f7cfede"
 * hashMessage(utf8ToHex("Hello world")) // Will be hex decoded in hashMessage
 * > "0x8144a6fa26be252b86456491fbcd43c1de7e022241845ffea1c3df066f7cfede"
 * ```
 */
export const hashMessage = (message: string): string => {
	const messageHex = isHexStrict(message) ? message : utf8ToHex(message);

	const messageBytes = hexToBytes(messageHex);

	const preamble = hexToBytes(fromUtf8(`\x19QRL Signed Message:\n${messageBytes.byteLength}`));

	const qrlMessage = uint8ArrayConcat(preamble, messageBytes);

	return sha3Raw(qrlMessage); // using keccak in web3-utils.sha3Raw instead of SHA3 (NIST Standard) as both are different
};

/**
 * Signs arbitrary data with the private key derived from the given seed.
 * **_NOTE:_** The value passed as the data parameter will be UTF-8 HEX decoded and wrapped as follows: "\\x19QRL Signed Message:\\n" + message.length + message
 *
 * @param data - The data to sign
 * @param seed - The 51 byte extended seed (3-byte descriptor + 48-byte seed)
 * @returns The signature Object containing the message, messageHash, signature
 *
 * ```ts
 * web3.qrl.accounts.sign('Some data', '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318')
 * > {
 * message: 'Some data',
 * messageHash: '0x1da44b586eb0729ff70a73c326926f6ed5a25f5b056e7f47fbc6e58d86871655',
 * signature: '0xec8a3ad1630b82a6a15686e79666d7a24a7f8c692acbba3f62456c49d7d1c3e473e94f8b4cb9360e995122c48841d17eef79bc6e8eeeb40d643941c07aa850dbbf1342b9549c48271cfbfd48cb67568e6220ebdd6ab43624c11a5176ac75ebce1ce9481cb368fc7b1066640482bf4e33f336bf386f238973f10b5b8a08a1ce5babb0f5060236dafcdbfb80cb91b4e34fd338f1c6751e47e47e8ad94f5daa4825cadab08c0cac808666697cb01deabc718dcd84703cb4045552c1d2cab176b19dc377810db8f21e331030860a831e385b199f66787fe589052c1a9353dc3350ad65e86f16ba79e5694da51c9fa4c882c9411e2a95f6011fb7dbd86bbb9d60f9d81ba38954d53f4cd81fe24909de070fcefed7edd55cb7e41249d605674003bf9f73a9d228b0c3881df78987720cbfc6aac68f64ab7df7069a4b2076088ff4d8f7806f99e269d32707a437a79775af93ec37a995ec4e25722b217b12d9c7bb49a2ff957e02bd94b4ccd8d3f9b855825d6f08354f95233c55c855a7e7b53fbada7380dea39cecca6695629c6949c4fe95e7e3bc29714bdd638de966adf2015fe9e6e5bb80b457d17ad9b8a7395bcbdb5b06e809017646a9e911521d22b9b42775e5bb5f2035f5df0224db461ce4f4896331e2568e8c960a076f3679682fb2b10b3ed50ede3f0bcf1cc8b1c50c802690d97ec15a130a36a41209ba9a5332476812427552ba99a52192e92b87a66abcaf6d8e456156f3f87d2d3a0b4498b30d155a8e2f4d50180988c74fb3dce018797c584fc8f55f89c723255ff4dc277cf3fc6afe45b3a372eb8948248aee7270f9d081ed231d5c4559ce24bcfc0efde8ea708adc8eea99628a718575b6369bfcdddbe02de626bb6fc8bb5ed4e643c0579fcfc78722b690631827cbc229fdf09c3f3af6ee72908756e5bb01b1ee1b31e96f16d5531ae06fbf7ed703e4e852af82d3164b23b42a8377c60a7ef66cc9f2e8733ab27068665c71745276dfd0e4e9e4a71f108806f2b39e790c7a19099bb4065961362fcb4ffbaaf9af64a527366542f19f4d8dd45c0da879123d9b23d73ccad5979398364f75a629c35aba791a708630175470ff5f3bcf340502c3b1745bec52dcaa2d063be76a598838fd0bb49ce80b084aec62030c7f53b02ac8c7b8dc07a7548f4bb9732d83c37fc0c70f7d7f9002a5a522ef4f5f8f98ae43c3b5da4db846964b40ae6034651c05e38e9836a9d72ec4a75cef2a5dca38401203cd7fe60fb1138ceb9b09bbb36483f3f1366953b484889126f74ca37389cc0639c368f8228de1fc70e8adbf1de146fcfc78e9989cff60efa9cd32d7e05be5c57eda2006e32c7019dcf3df8bd9b0935c34a2030e46d498fb89d098ed9639bb84f39ef0deb2e2c3a333150bff2a0abc0065cd1d717a18e2acee9da902ed7fd1b370f0617643638aaac8267fbefd3bf3cc3835a3ce4d9bddde7c01d28ba106e75a2c084995280ba95e1ba2a483392fbfa2c5094ed93398b7b0d1df00449f91baea21a0fd9010f738838480930dbdfe41ef70acd8d04e9dde5e6ebdd440646b8af1f76fee5cfb1a27fc0250dd553623b03aceac99a3b65e336888c975ad552fc5d9adb49047dc793ee20f1224da07e9f3a85cf43d1205c7b974810e9c0cb4cbc7ca930d9e2aa9b162156e3db57c80d1933931240a407fd710b8267c7f72f202b766318fb0679aa4e863aaac111b8d556963e60a3deb595599e85cbbfb9ad7f483d052d311cac389f1a67fa982f8c08cf94f547ace0d0123275e32bf5e8d304d1386d1d46c73891b88c4ea09f240e939e1f8d9b8aa64d0e18da9a235843463984d5c37fcc6c633b2f887c652d7b2589de2934ca3b3edbc706ef4c14688dfc762eacb27dfa7feb4f6d03c41c3f6eb7aadcec862d0bd03d61e087e336893b81d8d57e206faf36d487378bb866bb5fdf7e5659e69d93351c7c97c162d698ca5de5f7d287853b6672d14e5f49793cee9367a5a910db12c4c098e08e7e4233e4598e36c4907946753925e79d61db0a9a361dc1195b726294c603fd9b7798ca98f34655949e24dd8ad33d2bc512e38f7c26f248a7959548f844fe7c3ecc367381c529e77efe43ba23b59e6cda14ce27ece81e2d1e2fe2c55f2f29dadaee24dc2b2e638e1cad38fae7819e63e5275502f0f0a3825465d65cc017e873235ef4a871d8a0235f833adb6346d79c59f29c5e939e8cc2050eb9c64498654ef1e6ca975eeea8658eae664c26c5e9d667a29b7c36098c20701e2fe4ca0b922d6664e92c8ff7be49a75414c980d3545f915153006d60e092a2dd2b5e023508a256479d8f596ea57ae7e3548d6771a1b8298aa46df9ca7f49243281772aecbc79702c701dc85eb3b0813e0007551c5612f8351eaaec691079fa21363b8c07c8ae7a6301f65984936eef6f628b1157404184a6eadc87cec3bd34c498c7d9eb4355b79285bfd54a31b9e8f2cae2bd033cf8c4c4d4fd7cd3bd47c6bcd990152aec280a2a5617adfe2c67e6cfad40bd09d21675c9bb00e3bffa1efc2cbf9dcccedc5e0e7693ad6e04e5ab2330b8a432d79d6dac75badcce73129ca2cbe07074f4290622b165231b9fe2fa0ca028bf964b1e4dbd66e62d97b475c167145b302e7bd11c93884cdb76b2fb2ba0069492c9973aab5ce80a6152d3c14b9ba4e07af5201ebfeeaff572c2abd4a2158e31e8ef22132fa57f908318fb7ad52c7689f1a88e5c8cefdd460cd8fc2709dba564a3089a77513ac2e0500a6800d4f3b2245a230d90ed10218f08edacac2df43a1b62e8bcf343378dc1b14d6dc70f2e0ee848c263ddf52c52d14126c27379c1215b9b7555785767529d12e2e737eb346b3eef46150f7d7075e0ad16933b24c6ed6b12812b2878917062524bb0ba9a04797bcee675df0bb8062ffca21a6ed58c0fabd14b30f408714edd978199514ef267328ea96fc599e106ae3957b23f80d21bdf763c0e994c9d26ae2a3a98a7405098a151e51415f2d4d1ed87bf43fe7b6b6a632418fa1e996c237fca547773d847bf6f63800331c1bd77d9a0adb4f930dc1917e1f9f9163fbb086a91a5d7493899bed1658f6476808c393cde0d024d476840c28f8a40c5b8d179c2afb60c9f540e68c0cb6d9d0c383e6676fc0628242ac53c1be40a9bd5fd85366ca7af3e8ec5f087e0628a90378acaf16d0aee85e96e18447db68451336bfed0729ca71ff90e089740b87fabe5f702d3e37ac43fab6074d540c455f69251b0751d918cb4c40256fecbdff7c281b8e567762d2655c9e9f57ed5c59ab81744ef07598e70403a2561703f7274158540c0af52e4428213114803bba9e180dd7bb0ae2d20aac927af0d209ae331449261d5f72374ed37977daaed33860cf7bef036377274f86a8394b721773a6c9aa3ab895dd13188d75137cd25640ccf34af8d4a0e022a0aa992c96bf4642ee23def8178bd5f7376c7ae50fda9f9f13a86430d90af27fa0899c369112152cfed5e78b843f7e0864fd7e7edcc50ed36c5d9195109148ea9771a61651a187c059946a457fea2fa0dec08596a8c6dd85f4695fecc593c96c9480552eee4e4b3b7855b7d8b4ce079e783c024c224f2c15703a7cc77ef22d796a559b740184f963d234250f279c3bd77be36e5d1783d06c6ce45a29ac6e174ed4c761270938383cbba38df3e68f637f49b3a7b955600303fe8f2d3e4d3e7409af56d55f1229672a5b643fded07918cf3a7c3071f1f152627cdd366581328451c0aa7c202fc1106efb38d179c8bcde0f0716af45471bd09ad73d5902691605b3219ac223b7596714a81746032e30d0152a16f48516220937d3b6d1981553cdb9e8efcc70351da541d65505862e929140188e6058706f0950fb32f015935fcc67f859145a215fea9ca345a729bee8d96ae156f35283473306665ced9f8cb5cb926c6751f5f02f5d0f6ffcbd2de5dc0ebaf85d5c46ad9bca54305aa5e7e5848f2208889a5e0a187a0677b0bebf7a3326324a90de601c1ec0a99bfc75a397d56c0f535448450a798cdd45b931d1151605de65a2ae751cd34924c66891f84a200c56a4c0f9a3ff9a8766198dc0be298868770bbee13ec6d46dc6d6fecf63196848a5e3bb2f6991dc1be3d6fa85245710e8efb17b3ffe5848ff90a874fc69ddbc6f18c4c037a019216aafd8e35512d3d01d262baf840cf940c8f41c78be04299383b89461d26dda3a6862027edeafd9f50fa6fe0dfd3b8fa5f535b985cf6a3d0bc0f44b2f77e66ef583ab6ffb97170b30331e01e183a77ce65bcd6fc3cc7961f475a4f8e425a0068e9f9393abe6d3f178b3dd2d63353089e3b1315459619d18d9ebecc203b502207b56f570e539cab8e8755316d050f9890d34c3e60e1ee618e07b62fae542d687d74b20f7eaa395831276b279f9487effa05514670d08beb7365fd3fd1b090b6838d4650618e2a450fe6cb54ac34b1824b4314ec34b9a961eb6f264086f35b23602b077bbe5a5bb20cfd74583ef27323f2be31f8967d096e70e68dc8a6331cd07c4566f3871d7003a3738892e1831c10803efaf4e70eb534062369731109795421bd017ac1daf088e051cdc0255cc6fbca99c84ecabe92ad150d759555cb92aed8d1e7963384c0b6fc869518545e007626f94577ab0807a974040d3009c7b0ccdbf9f6c88d371af0ec7226be236bdf5db306b65456dbc599a9b5ecaeae707f0f31717e866b1e1f0ffbc225d6d9352ddf9454677fd38b833e111fa3f14cf9a795a5904d84ab8ff4c3c4b9aeecf3a46ab744a0462e1f8d1f994d230486c07211a13b632e7ea08883076850863bd89114fd1f883a036edd06a23e3772c02863c1dae722f522d42bcab9a3613eae46a2bb4bb93d72937d4702fb072e65566875f26192a2578b5b917d367f271b02e411342a5a9d68ecd72aaef0ff685e24919a3c1b6d00be9f29d46633dfaa58cd2968989f0162ec2d64458a3c76b0bb6d989eca1bdc30c37e825e0329108046eb8c18e66ee83aaaf12d0c13fef9583df3beb1d15d3e29b4a8720c984420b1e05d1ad5adfb07b720fa9c69c847bc038be8a8f1cbbd5a853a8259a72e3f06d0d195e77af858e7a7e8c594496b009a6899bf2161230072f58483e9a88fc10db1261716049114e3a00baa184aba4400d6ea34c709303579ca7bc6f83275609e27d2cd98babe1e37cf11bedd5e5df6be2e585898d9058cf22ee3bb44673b783d1e72849342935a4e6eca9759044e1f87d7be7dc1fea50cfed8cf6232f7a47132ee8fdc39b85e99f7da8d65a2ec82598a19ec4f598af3937a0fed0a6ba53cbe6bbd7538dd06868500e31262a9cee3cab333df177c30c698941c695bbf1c506604e1cabb8c9f1bf9df09f0a0cb7432a8c029f37b6e025918236ee495c7f6c32d52716e87c977451713125f58425b00657ddbdd94d3bf98cfb5ef0c469160745dc88c8d5296de9be6488a49ad7b2afaf76dc7bb7f7ca4ca1a1433ca77405ce2e2e6c934beb868f02a505d1750720801ad76d91d59810fce76760d4b747204d891673aa0d5c08df0a042cec89d0c00666e3cfe77650d138d2cf35cd3af012539248c98d1c0842952c209781cadafdec3b3c394ec8ff1a777c11a3727175a279a536da1489397d4af5f26d8184234797933da301454553f31b78ae001922324f23034cdd62954482f4a723fc82b614eeceff97fa00dab2a9e9c354c5a9369c1537a4747872e59e8805f0b738885c0ead943ab6fabcacba150db1ad68e767b8a62ef94c9909f872e7b3cac8b4ad970e14284f3e5dbbde9e541d943c1f421bcca18e9463d3766582deab592f7e003e82ef10f407f58b241a98c0c824251af48dbb874aceaf4f44d88a86f15c71eaaa8b8ea0e6821ab968be91da29802c9909aa554d781c072ad3109e6e8f124d77d2b12adb685c663b8725a82581a0be33a4ee1abbbf72b30d6ca950ba51ed4b3e813be7891dd5d775649124b0e3f76471461c451ecd643ceeb3d2162cbdd70be1676fbbb16f874bad11ca57b330f4d508b9511fac45bf16a4ea6d7bafd6cca9388746ff46ff3d73133f3102e57cbfed7929a8f75cbb91151c4ab6521727213ab383fadeb3065c28adbdbbc4d926f45baed69d212004b34c03cebc6bdda3b92490047218997447498be655e25b5786ab7a18c35d2f761e0e3a1fddb73aaa32e2985258747aa7af7bb4e8454df1a0cc864f9e36a62e9a9fe3ebe98b3109a4d201c3c98bb42166423f84f0cdfb8af74bc77b81e47d5b5b5c12c0bfa307fd9ab0c13bd3b38d25e0425441fb22bdc4a75d8eb4b72c836d2b5e9264ae9f20d9708ffedfdb81a2379510432657ff855a147610d4f08e06ce30d928e094c07d907f14ada32fdc4f3cb2bc7f0c0d24748eb0d015455972808287b8c9dae4e70c1a2e61678aafe2f5274d5867376a6fbabfef00133839a5e9f42b3e46636f7da6b01360b30000000000000000000000000000000000000007131c20262d3538'
 * }
 * ```
 */
export const sign = (data: string, seed: Bytes): SignResult => {
	const wallet = newMLDSA87WalletFromExtendedSeed(seed);
	const hash = hashMessage(data);
	const signature = wallet.sign(hexToBytes(hash));

	return {
		message: data,
		messageHash: hash,
		signature: bytesToHex(signature),
	};
};

/**
 * Signs a QRL transaction with the private key derived from the given seed.
 *
 * @param transaction - The transaction, must be a EIP 1559 transaction type
 * @param seed -  The extended seed to import. This is a 51-byte value (3-byte descriptor + 48-byte seed).
 * @returns A signTransactionResult object that contains message hash, signature, transaction hash and raw transaction.
 *
 * This function is not stateful here. We need network access to get the account `nonce` and `chainId` to sign the transaction.
 * This function will rely on user to provide the full transaction to be signed. If you want to sign a partial transaction object
 * Use {@link Web3.qrl.accounts.sign} instead.
 *
 * Signing an eip 1559 transaction
 * ```ts
 * signTransaction({
 *	to: 'Q0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f0109fc8df283027b6285cc889f5aa624eac1f55',
 *	maxPriorityFeePerGas: '0x3B9ACA00',
 *	maxFeePerGas: '0xB2D05E00',
 *	gasLimit: '0x6A4012',
 *	value: '0x186A0',
 *	data: '',
 *	chainId: 1,
 *	nonce: 0,
 * },"0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318")
 * > {
 *  messageHash: '0x5744f24d5f0aff6c70487c8e85adf07d8564e50b08558788f00479611d7bae5f',
 *  signature: '0x9cfcb40cc7d505ed17ff2d3337b51b066648f10c6b7e746117de69b2eb6358d',
 *  rawTransaction: '0xf8638080836a401294f0109fc8df283027b6285cc889f5aa624eac1f55830186a08025a078a5a6b2876c3985f90f82073d18d57ac299b608cc76a4ba697b8bb085048347a009cfcb40cc7d505ed17ff2d3337b51b066648f10c6b7e746117de69b2eb6358d',
 *  transactionHash: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
 * }
 * ```
 */
export const signTransaction = async (
	transaction: TypedTransaction,
	seed: HexString,
	// To make it compatible with rest of the API, have to keep it async
	// eslint-disable-next-line @typescript-eslint/require-await
): Promise<SignTransactionResult> => {
	const signedTx = transaction.sign(hexToBytes(seed));
	if (
		isNullish(signedTx.descriptor) ||
		isNullish(signedTx.signature) ||
		isNullish(signedTx.publicKey)
	)
		throw new TransactionSigningError('Signer Error');

	const validationErrors = signedTx.validate(true);

	if (validationErrors.length > 0) {
		let errorString = 'Signer Error ';
		for (const validationError of validationErrors) {
			errorString += `${errorString} ${validationError}.`;
		}
		throw new TransactionSigningError(errorString);
	}

	const rawTx = bytesToHex(signedTx.serialize());
	const txHash = sha3Raw(rawTx); // using keccak in web3-utils.sha3Raw instead of SHA3 (NIST Standard) as both are different
	const extraParams = isNullish(signedTx.extraParams) ? Uint8Array.from([]) : signedTx.extraParams;

	return {
		messageHash: bytesToHex(signedTx.getMessageToSign(signedTx.descriptor, extraParams, true)),
		signature: bytesToHex(signedTx.signature),
		rawTransaction: rawTx,
		transactionHash: bytesToHex(txHash),
	};
};

/**
 * Recovers the QRL address which was used to sign the given RLP encoded transaction.
 *
 * @param rawTransaction - The hex string having RLP encoded transaction
 * @returns The QRL address used to sign this transaction
 * ```ts
 * recoverTransaction('0xf869808504e3b29200831e848094f0109fc8df283027b6285cc889f5aa624eac1f55843b9aca008025a0c9cf86333bcb065d140032ecaab5d9281bde80f21b9687b3e94161de42d51895a0727a108a0b8d101465414033c3f705a9c7b826e596766046ee1183dbc8aeaa68');
 * > "Q00000000000000000000000000000000000000000000000000000000000000000000000000000000000000002c7536e3605d9c16a7a3d7b1898e529396a65c23"
 * ```
 */
export const recoverTransaction = (rawTransaction: HexString): Address => {
	if (isNullish(rawTransaction)) throw new UndefinedRawTransactionError();

	const tx = TransactionFactory.fromSerializedData(hexToBytes(rawTransaction));

	// Verify the ML-DSA-87 signature before deriving the sender. Without this,
	// getSenderAddress() would return an address derived from an unauthenticated
	// public key embedded in the raw transaction, letting a tampered/forged tx
	// resolve to an arbitrary sender.
	if (!tx.verifySignature()) {
		throw new TransactionSigningError('Signature verification failed');
	}

	return toChecksumAddress(tx.getSenderAddress().toString());
};

/**
 * Options accepted by {@link encrypt}.
 *
 * This intentionally omits `iv` from {@link CipherOptions}: AES-GCM fails
 * catastrophically on nonce (IV) reuse, so `encrypt` always generates a fresh
 * random 12-byte IV internally and never lets the caller supply one.
 * Matches the go-qrl keystore behaviour.
 */
export type EncryptOptions = Omit<CipherOptions, 'iv'>;

/**
 * encrypt a private key seed with a password, returns a V1 JSON Keystore
 *
 * Read more: https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition
 *
 * **Performance / threading:** this function is CPU-bound and **blocks the
 * calling thread** for a significant time (~15s at the default
 * `m=262144, t=8`) while it runs Argon2id synchronously. Despite being
 * declared `async` it does not yield the event loop. Callers on a UI thread or
 * a server event loop SHOULD run it in a worker thread (as the QRL wallet
 * does).
 *
 * @param privateKey - The private key to encrypt, 32 bytes.
 * @param password - The password used for encryption.
 * @param options - Options to configure to encrypt the keystore with argon2id. The GCM IV is always generated internally and cannot be supplied.
 * @returns Returns a V1 JSON Keystore
 *
 *
 * Encrypt using argon2id options
 * ```ts
 * encrypt(
 *   '0xcea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *    '123',
 *    {
 *      m: 262144,
 *      salt: web3.utils.hexToBytes('0x210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'),
 *    }
 * ).then((res) => console.log(util.inspect(res, { depth: null })));
 * >
 * // Note: cipherparams.iv is a fresh random 12-byte value on every call, so
 * // ciphertext is non-deterministic even for identical inputs.
 * {
 *   version: 1,
 *   id: '1b1dd3e2-ee6f-49c6-8a9b-a4722046582e',
 *   address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
 *   crypto: {
 *     ciphertext: '02383d4ea331fdf518651aa638d77f36de002f6b2cb340712c2957b68f927234a9c87f776e40b61227aca366bd4b7056046dfdddee29df22290939a1e96f5be5',
 *     cipherparams: { iv: 'bfb43120ae00e9de110f8325' },
 *     cipher: 'aes-256-gcm',
 *     kdf: 'argon2id',
 *     kdfparams: {
 *       m: 262144,
 *       t: 8,
 *       p: 1,
 *       dklen: 32,
 *       salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
 *     }
 *   }
 * }
 *```
 */
export const encrypt = async (
	seed: Bytes,
	password: string | Uint8Array,
	options?: EncryptOptions,
): Promise<KeyStore> => {
	// eslint-disable-next-line no-use-before-define
	const seedUint8Array = parseAndValidateSeed(seed);

	// if given salt is a string, convert it to a Uint8Array
	let salt;
	if (options?.salt) {
		salt = typeof options.salt === 'string' ? hexToBytes(options.salt) : options.salt;
	} else {
		salt = randomBytes(32);
	}

	if (!(isString(password) || password instanceof Uint8Array)) {
		throw new InvalidPasswordError();
	}

	const uint8ArrayPassword =
		typeof password === 'string' ? hexToBytes(utf8ToHex(password)) : password;

	// AES-GCM catastrophically fails on (key, nonce) reuse: a repeated nonce
	// leaks the authentication key. The caller must NOT control the GCM nonce,
	// so we always draw a fresh random 12-byte IV internally (matching go-qrl)
	// and ignore any caller-supplied value (finding C18a).
	const initializationVector = randomBytes(12);

	const kdf = options?.kdf ?? 'argon2id';

	let derivedKey;
	let kdfparams: Argon2idParams;

	// derive key from key derivation function
	if (kdf === 'argon2id') {
		kdfparams = {
			m: options?.m ?? 262144,
			t: options?.t ?? 8,
			p: options?.p ?? 1,
			dklen: options?.dklen ?? 32,
			salt: bytesToHex(salt).replace('0x', ''),
		};
		// Reject out-of-bounds Argon2id parameters (after defaults are applied)
		// to avoid unreasonable memory/time costs.
		validateArgon2idParams(kdfparams);
		derivedKey = argon2idSync(
			uint8ArrayPassword,
			salt,
			kdfparams.t,
			kdfparams.m,
			kdfparams.p,
			kdfparams.dklen,
		);
	} else {
		throw new InvalidKdfError();
	}

	const cipher = await createCipheriv(
		seedUint8Array,
		derivedKey,
		initializationVector,
	);
	const ciphertext = bytesToHex(cipher).slice(2);
	// eslint-disable-next-line no-use-before-define
	const acc = seedToAccount(seedUint8Array);

	return {
		version: 1,
		id: uuidV4(),
		address: `Q${acc.address.slice(1).toLowerCase()}`,
		crypto: {
			ciphertext,
			cipherparams: {
				iv: bytesToHex(initializationVector).replace('0x', ''),
			},
			cipher: 'aes-256-gcm',
			kdf,
			kdfparams,
		},
	};
};

/**
 * Get the seed Uint8Array after the validation
 */
export const parseAndValidateSeed = (data: Bytes, ignoreLength?: boolean): Uint8Array => {
	let seedUint8Array: Uint8Array;

	// To avoid the case of 1 character less in a hex string which is prefixed with '0' by using 'bytesToUint8Array'
	if (!ignoreLength && typeof data === 'string' && isHexStrict(data) && data.length !== 104) {
		throw new SeedLengthError();
	}

	try {
		seedUint8Array = data instanceof Uint8Array ? data : bytesToUint8Array(data);
	} catch {
		throw new InvalidSeedError();
	}

	if (!ignoreLength && seedUint8Array.byteLength !== 51) {
		throw new SeedLengthError();
	}

	return seedUint8Array;
};

/**
 * Get an Account object from the seed
 *
 * @param seed - String or Uint8Array of the 51-byte extended seed (3-byte descriptor + 48-byte seed)
 * @param ignoreLength - if true, will not error check length
 * @returns A Web3Account object
 *
 * The `Web3Account.signTransaction` is not stateful here. We need network access to get the account `nonce` and `chainId` to sign the transaction.
 * Use {@link Web3.qrl.accounts.signTransaction} instead.
 *
 * ```ts
 * seedToAccount("0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2");
 * >
 * {
 *   address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 *   seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *   signTransaction: [Function: signTransaction],
 *   sign: [Function: sign],
 *   encrypt: [Function: encrypt]
 * }
 * ```
 */
export const seedToAccount = (seed: Bytes): Web3Account => {
	const acc = newMLDSA87WalletFromExtendedSeed(seed);
	const address = bytesToHex(
		addressFromPublicKeyAndDescriptor(acc.getPK(), acc.getDescriptor()),
	).replace('0x', 'Q');
	const seedHex = bytesToHex(acc.getExtendedSeed().toBytes());

	const account = {
		address: toChecksumAddress(address),
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		signTransaction: (_tx: Transaction) => {
			throw new TransactionSigningError('Do not have network access to sign the transaction');
		},
		sign: (data: Record<string, unknown> | string) =>
			sign(typeof data === 'string' ? data : JSON.stringify(data), seedHex),
		encrypt: async (password: string, options?: Record<string, unknown>) =>
			encrypt(acc.getExtendedSeed().toBytes(), password, options),
	} as unknown as Web3Account;

	Object.defineProperty(account, 'seed', {
		value: seedHex,
		enumerable: false,
		configurable: false,
		writable: false,
	});

	Object.defineProperty(account, 'toJSON', {
		value: () => ({ ...account, seed: '<redacted>' }),
		enumerable: false,
		configurable: false,
		writable: false,
	});

	return account;
};

/**
 *
 * Generates and returns a Web3Account object that includes the private and public key
 * and a seed if it's not provided.
 *
 * @returns A Web3Account object
 * ```ts
 * web3.qrl.accounts.create();
 * {
 * address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 * seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 * signTransaction: [Function: signTransaction],
 * sign: [Function: sign],
 * encrypt: [AsyncFunction: encrypt]
 * }
 * ```
 */
export const create = (): Web3Account => {
	const descriptor = newMLDSA87Descriptor();
	const seed = qrlSeedFromBytes(randomBytes(48));
	const extendedSeed = newQrlExtendedSeed(descriptor, seed);
	return seedToAccount(extendedSeed.toBytes());
};

/**
 * Decrypts a v1 keystore JSON, and creates the account.
 *
 * **Performance / threading:** this function is CPU-bound and **blocks the
 * calling thread** for a significant time (~15s at the default
 * `m=262144, t=8`) while it runs Argon2id synchronously. Despite being
 * declared `async` it does not yield the event loop. Callers on a UI thread or
 * a server event loop SHOULD run it in a worker thread (as the QRL wallet
 * does).
 *
 * @param keystore - the encrypted Keystore object or string to decrypt
 * @param password - The password that was used for encryption
 * @param nonStrict - if true and given a json string, the keystore will be parsed as lowercase.
 * @returns Returns the decrypted Web3Account object
 * Decrypting argon2id
 *
 * ```ts
 * decrypt({
 *   version: 1,
 *   id: '1b1dd3e2-ee6f-49c6-8a9b-a4722046582e',
 *   address: 'Qcfec0cbee560cbd6ed89580204af71448f1fb8c577e60e9afc6e697019e2312cf3b24b98eb763627a1c38c96ecd7e7c20ba9774cb6c0a810b78e8ea529ccdc40',
 *   crypto: {
 *     ciphertext: '02383d4ea331fdf518651aa638d77f36de002f6b2cb340712c2957b68f927234a9c87f776e40b61227aca366bd4b7056046dfdddee29df22290939a1e96f5be5',
 *     cipherparams: { iv: 'bfb43120ae00e9de110f8325' },
 *     cipher: 'aes-256-gcm',
 *     kdf: 'argon2id',
 *     kdfparams: {
 *       m: 262144,
 *       t: 8,
 *       p: 1,
 *       dklen: 32,
 *       salt: '210d0ec956787d865358ac45716e6dd42e68d48e346d795746509523aeb477dd'
 *     }
 *   }
 * }, '123').then((res) => console.log(util.inspect(res, { depth: null })));
 * >
 * {
 *   address: 'QCfeC0cbeE560cbD6ed89580204AF71448f1fB8c577e60e9afC6E697019E2312cF3B24B98Eb763627a1C38c96ecd7E7c20BA9774cb6c0a810B78E8ea529ccdc40',
 *   seed: '0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2',
 *   signTransaction: [Function: signTransaction],
 *   sign: [Function: sign],
 *   encrypt: [Function: encrypt]
 * }
 * ```
 */
export const decrypt = async (
	keystore: KeyStore | string,
	password: string | Uint8Array,
	nonStrict?: boolean,
): Promise<Web3Account> => {
	const json =
		typeof keystore === 'object'
			? keystore
			: (JSON.parse(nonStrict ? keystore.toLowerCase() : keystore) as KeyStore);

	validator.validateJSONSchema(keyStoreSchema, json);

	if (json.version !== 1) throw new KeyStoreVersionError();

	const uint8ArrayPassword =
		typeof password === 'string' ? hexToBytes(utf8ToHex(password)) : password;

	validator.validate(['bytes'], [uint8ArrayPassword]);

	let derivedKey;
	if (json.crypto.kdf === 'argon2id') {
		const kdfparams = json.crypto.kdfparams as Argon2idParams;
		// Bound the untrusted KDF parameters from the keystore JSON before
		// deriving the key, to prevent maliciously large memory/time costs.
		validateArgon2idParams(kdfparams);
		const uint8ArraySalt =
			typeof kdfparams.salt === 'string' ? hexToBytes(kdfparams.salt) : kdfparams.salt;
		derivedKey = argon2idSync(
			uint8ArrayPassword,
			uint8ArraySalt,
			kdfparams.t,
			kdfparams.m,
			kdfparams.p,
			kdfparams.dklen,
		);
	} else {
		throw new InvalidKdfError();
	}

	const seed = await createDecipheriv(
		hexToBytes(json.crypto.ciphertext),
		derivedKey,
		hexToBytes(json.crypto.cipherparams.iv),
	);

	const account = seedToAccount(seed);

	// Parity with go-qrl (accounts/keystore/passphrase.go GetKey): confirm the address derived
	// from the decrypted seed matches the address recorded in the keystore. This is a local sanity
	// check on the (unauthenticated) `address` label — it does NOT bind metadata as GCM AAD, so it
	// keeps keystores interoperable with go-qrl (see C18 explainer). Case-insensitive because the
	// stored address is lower-cased while a derived address is checksum-cased.
	if (account.address.toLowerCase() !== `q${json.address.slice(1).toLowerCase()}`) {
		throw new KeyStoreMismatchError(json.address, account.address);
	}

	return account;
};
