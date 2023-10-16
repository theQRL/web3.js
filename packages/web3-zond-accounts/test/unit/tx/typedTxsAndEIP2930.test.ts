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
import { bytesToHex, hexToBytes, uint8ArrayEquals, uint8ArrayConcat } from '@theqrl/web3-utils';
import {
	AccessListEIP2930Transaction,
	AccessListUint8ArrayItem,
	FeeMarketEIP1559Transaction,
} from '../../../src';
import { Chain, Common, Hardfork, uint8ArrayToBigInt } from '../../../src/common';
import { Address } from '../../../src/tx/address';
import {
	MAX_INTEGER,
	MAX_UINT64,
} from '../../../src/tx/constants';

import type { AccessList } from '../../../src';

const secretKey = hexToBytes('9a26bbc93aec60f45b27f6d34fc606ec9c603956e0bf10b5e8c0f2c73c982d7ec40c58fda152bf36e780aaaeccea28459873d675af14a205516067b2773cd6e6e07a519dfc884e0a736541bed61da84ae0af9258af931a53384cb030b69e75b459088d03087203334452240242948c04216d01244651a27099080ed2c24881b871d3846823446900b0411c8664014591db240040422d12176d0c2508a404600209925814465198600884249922314a464409b9045ab66ddb44291cb520a0486ed3206a81b409d88024da106920b30884409043128124b22d4b30901a052edc2888933012d4386a0a2781010064dc1872239860a0a2019286310a178d59108c04318158c6208a44714b906c4822240c428ea1c05051a42c12c4441aa045a0188ce000088bc2041cb94c819020e4b204093725c3142a1c470d9b1620209284c00246d21469504072219269d24006241391e44461a03831048565a2204250a430d1088949c6508aa60d24c80010192d0a242ada2048c9160dc4a82d418650a1b26002486d1098244a40069c8000dca24593964904c62d4984491129209c148a9c101260c84d44a06463a224db4246e4982c032991cbb44c5c244c50480aa2386c14188a24088a819649a1b48d1a476d2044251c28850a931152244208100a1a144911920483a405ca1844094568a3408201362908119019366e5a484c4086884040605c386208c44458286d8c089188406a6004008b46811ca684e4023063405289b680c344500ba7251c39255988111ac90d42946d418841003150a1b0886182510a99002316529046508c944401358223200e11060950380822248a9b04611023011b86885430615a1290a1048d09242ec8440d5008465c024424150e0b09915b14061ca385d188444132090319045aa85020270c21b71063025219c34811050e590221c486018ba26162162243162419452221b7488442311c30681a9741a34050c12212e4a04c8b26718912645b3071c928110b254e22062a41248991c844240568401872003330e22448a3a6458cc40594064102b76d02156112238e9388294432905a408c48946483460a00c625492461c12289db1809982432032744891061e23652ccb00cc3246988247119242d141568c92802cc08811cb34022c10810b551d1926c14a34c21099201b445908668da3012924885e2346a20072d442461211540a18889981880dca2048a9001d9b4314418912482515204112401242009440c070493c22518c28d1a0568db30066280851342890a80485b406848022c5b244c1a136484b491e3360ccb3241222572d946029c122e2238450992280c04248c18201b496d24a10012b17151182800842c8aa211234891c12628939649d8b289cba061e1382ec4860c03a44d4b46921849729ba82891c44d8a8244e1b68cdb180ee0285020270d8a066e413608cb464ddc2220e142411a204d041949203570a1400050445093203151382c84002c1cb281e1404c1946041aa06862181188324ea2160e59042c20044a6046680109410c86489b3661c10881dc106248480140124c998281e1242dc40048240151e4200011337208872d18482888b82d13102d108684184165cb324292402418424860a6659bb62d9ca265832030248581230084d8320e8046228a184a9a128a011569020062138864d498501344114448828846469c887111404913206d4b020a5bb2208ca89021b708e20624c2a071e1082a0c4520d14672a3408c03b96402412948448e0cb62cd3a4604114824cb2244a382c1296291b382103240d88026584008e02a748cc108c64b27022160c240145e43832c1304c93000983a8091c256e5148691230620c182e821090c9062c0b87710c176562402c04254812c291584025a014806206601ab68d9c3284c802829aa28548366d49000193460424099119414d53486c14862d2499658ca801cc2646c4306680083022998848309040465250380cdb902cc144858346260124048a0052d3b230088664039621c200095ba6206348241c410623c161c1b48cd494652440420b47650a952922422961321209346ae2c40510c844110604042951cbc62c53969102c010828091638004e34888cc180598a82183128ec4a040e29849a18204bd9bd4a8b304b7b79b858421df6923dc327a20ca0395559610f32e0730d06c789afb6937881af205df5546bf585ca85165eefcbaeaae572556a06c1c2eb2fdec2589a80cd608dea099b1f46f06a18f74a094f07e1ff6385691a6b9cfacb00fef59f28e6e976af41ec6ec13e4585196d8fcd2d1b9bcf15bf73eb5ceb21752bfae628621af0c643097d2c8525aac48da1c697b602d67084a63bd6aa99facd09480efdf2290ffeecd7b5e47de09f6abdb3a875ba84713dade7ec47c058a0df7fa38c943a7e9f8d33fe3075d487bbcd4c8a46f8fbb4d528f2eac241bafb6b8d7fe32dde311ee03fe1998d401385099c866ebc9e310daa785b9034ddf97baaa8d9f629400876918afccc6b458aa702bcac4bc8ccb150fc1bec1dac4fe3eb1d80284048abcc334aa0a96fc738923223f7d05757a01bd7a6d9a5632bde15d36a3e9ac1b52f786a6fea0905fac524ada4f880ac2e50cc4d5d5499e98c1cb9ade7f19bcbd3274491d05bbec4a5eae56a1e657eaae8ccb4302f2b32cbaff83463150bb3fbbf86b29b3c9b555c22277b4072fb1d8c5c9e767f8632a0463a3034215c707ab5e72aa6afa0c1c3a8e07e71908ae6531798fee1f688f24aa854b41d1177449e22dcdd61a5801a2b58bb9535825f93a7063dcad1265dbb9598bc33fb1da768a15c9d78ca9eac3eedbd044cfc2af09c43eeee090266b142473a7c1fa1ea68bcb70ea4d5096ecaa62c58a8c0118b876480b328bf9d8cbb979d688ecaa5ee1323ec92281bb0b258440c8eb6f31aa7402cafff28fe83070872b89ea246f6f18aa5306fde8103ff52e6d17b698e316e22c99143a751ea20ee5911d8910addf4380b30bca102314c940324f434b2f73e37fd1665b158ace7ca2b5b8c9b24d0917826db65956dd1d8a2d3c19491f53b0d01debd53fa3753807bad20e5f90586c68fe2a7af7486592841ede99625eac5b2d80f4b0cbd6bce89d59d6b7698587a8eb3b7c298d95e077448b3327ad0db52e3dea13826e722369aa173b89d3bcb192bc1ed3f006c750d1f942cff68604571ac5ae4b1cdfbfd66d2ffb7fc58c3e9d797b08f08d0e4a7c488e8967ce1b462b20655f4108b3347d0f7fedeafba46f69bf0b807284b48669edd5cf05615a29b85d5118452a6a86d4803a087d4e01242e1c5213e0086aebda8ecaebd2e419dc4e1e9cfa20b1cd4fd9bc372e25812f0dbc51f4f1145ae409f2e111cde9459d43ec3ff1570d03c8f9737fb4e7e49777c5b01453238cf7a95677b6327bce6855f00a7646abe69dfd283d561e990f09e22d25dab2a80b92e29f0bb7c102ac59f1ec8bd3caa73c24f4c3991b107ef52da1721c066f6651b837e7a8e6ed0fae5025d05ae0408d2d926b676d7a0bb17ba9f617cc265ba7205d55ae8222717ed7e2a21e5497ae55c3b3a9c712611a8de0c02f1964964186f3dc28af0a39b2d584d5b62b1d3c8e70883b6a2114f726956ec3053bee7d6aa9964c70a73cfdc870e7d639dacb0317e5790ccc06026f72661936812f2341b89ea5493df4810889720057a4237607d02bdcb2770e0dab04f0587caa35476c5135c9be522904ee802d1822a3603ecbcd8f90816da5fb2dff0ee6c0c9c7ac1c861a73fa3cd7a22149333a2eca0e6e4791f8e6ca17b48fb1e3a7289c539111786221017eb6b0182afa07e52f12969e00ecdaa789300fa499eae31d14dc42ee6c0d851f9edb1907ffbd081e399ea5c30d6efcc53f5b2286acea7ec99210b96c3f894a18b4a0a2fbdd18bb59e2d41b98b8ba4bc895dfe995ebde63a1e25ac7922c7397ad19f6bebf940f28404e1da4c7c492f7968f608b5d19bf83b9590f3b2c18042751e2b859777f4ae9b5a33ea30fd8a36d26805b87f47eeaaf3909e7f4ab0bdc42f6f4f05984cf06274a247c96f946b79e801999f417a2bad3956bbac4277212d491a989bda591407b1698c9a59fdba95bc90f01fccbb806f38afd1117978e895baad4d7e8775583bf63427bcd6f598395f58a628a0ca997f3eacd1feb5bf2b5dea4168ec8eb3592b17de10e93ce57d6a0e0623883697ce31bba7cd5c338da768459fdde2bc4c407951631bbd37db7916b5528a2a3382f4f87f0174ee8de10cd1ae026f5c88e62d8d76f629d383f3f24244cb9ff37ee5bf720c1f4f331945dca422438142a6590af75c7764b1576166401017820527a045ee804326735d7351b2fa09afabb447b6685ff943175fc4ae2d5bb4f2571066ec7e908ba23f2ed4644ccf93e607a485f3e35db5e7e27f27191b9bc56846e9e55f15d5b3fa7aa750e543cf8d8164aed2a070a292074c128a859e5877e65356b3d044de8fa71ac74bebc02539aafeb940fcb21b1a0a35f8d678c8b3afa3ded1f4d96d0075f550affbfeca943f2e124f9449202c15a11e0aafb1fe5bce2ca6b7dbf2a3c653b03b30bf4e64856001eed56651da98a65a0822f1b3220fba8e8941364e95131b1fcf20a9371250dfae9e0b45c915362288e0dc53f1a548efb326338192151c3104ec4ba09c2cfdb53efb49993334ab88c21a81675662d359267c4b48f9dc034728f58a2b748ffe07da39fb10e08165b13bbd230dc11e2a3b5825f7149b24a61691023658b6c1fae3d45848b5972c3a53a0f6c672cb7bab7d3d453bc8d98ea39d2620f449a2083a94482ab6b5fca5483b7c99a54bc38b5eed9ffd8bcd9b41a934442cf60d96fd9164cf17c3b48b94bba2563c9ea3d079b84f5c227795e7eee26070b49d2762a427329a36643a7b286d5db979f2c6490bdc60f8dbb01dd6ddf043539e51b71cf03d964a5b0496f440c4e4b69bf756b2dd554ed44da2c951a91aefc519d9c0068e7a4628e7ad41817ab95fe3bd60c857ffc9fd62edfa18f60acc4983d9eb8b67f549b0a96af08f08beaf30a9bde7fa9dbe8648ce63013557615ca05840bed217b4c9bd264da847f749b88c784fa40710368675bee45c021588e32c1f9c1ee17250ecc068ab4351e9cd47be7bda1652c8432e53f964e4028fbfa98216e75df5d0b31baa2f851ee41fbf44486b8fcc02bd7f979974d8fde1d0c9b867fdaf1a2b019a20c42e928896b1dc2d164c0ca48bc60222fcb2a7f892afcc4ce88807486f33834a2ece1f1ef8c712e1a671126e033090e66beea25247d84681e70266c270d07714f5e67a620cd0303ebfa22ab411a92cc74474537677069552b63986d35479b64bd4623a5c918f6e8edcb68e7ff8ac5e8ff6e56d300001987deba327fccee3bfcfe7e1f82b9b8ed2ac4f23e6adc20535fcdb415ad71db34c70a4eeb567cd60332ce377b3ffd9c68daaea3bfaaf90d6f7ee44864b18298a80444dd76175996f53f992c64ce2022fecd8ccbf348392a19b0dd97abcb261566f1ee335f58c091e4a6aaf8c6267aa280817c46eea95d419df1c9bba84c89b0b5f8fdf849387e82ee4938c00f620ad3b2e198da0803975089642454f1f368c76cbb0df5f1054279313a89b0bfe327fbc0ca7e158579121810f43dc01e438fd7f892b1477489ff2a392899869a662971050916756530a264ba18150ada583a0af8f1c6d05824ca27159c49724afb739840a8bdfe7f6c4fb67fb038bf942b7e3b03a807a5af4cf27ebaad960ccb948cd236e4cfca7a97e398057e1dd951bf803b1e37aee24650d104211fca0d29ac5abcb844aec230ffdbb473f9032bba894bfebe49bb6f5cb156a0c61115d557be93bfb99a4a690c6a8c680a3d5894eedcd22e48c7a9b55084f2b04d8e2b3ce89dbed0f2745a20adcc8a2f663fb50e5ae93cb29d818ca490a4d8db0932c09c64a16c6dcd1fd67f2d2e7587c92ea89da152734fad5ba9313de42164414ffde12f8c2c97fff0f90e00099161c0c19eb4b4bbc6842a413ec102002b43b2a0f1aa73d54ba951f62fca6f45ba170708520c3ac3f3f1482c9c488d66ee8b0db5db93feb712062e98dc3d0fa768890d9c5d8d217133c3c33e32ad4d2e644ec3c58b8fc3aabe226212bfe1ffda676786eb468db3d75961873ae7b6231094a5c7f4fc150a3f2131d1dc6511475c0a43815acac45efa74c6e8763e2187654e3888e1f27987d7f06995901732f908eadde8ccbffd1c8c3d8d1e41782a0ca245b6c9918e41e04f22452d9ea0a7bffa5f8edf8ec5e0d63a10b4cbd2f92f5d574fa926ebe3a68058c57431945ebbabf026416967864fc70859a84f4537aba35c273b974139d1afabc607f723e333b8c8a19e9da824b5400ea19a62ec1717cc0dd62502b5efff40e9e442329d369614ec909931282bb922a3af93bf0502486e7b2584a11e0c9aac92bf55a5c72126b64d6e4d1b672a88cb167983e969a69643c5c565cb78a6b6acbe6ff160bc31d5d359fe04f09dd72399b883f87ada43cad0ac36e8c40ae46aec88e51dd90ff2255f69449bfea94a9f5e87d703d714579c700f9c65f9046850bc23159460c9952b86fb886362a245cb3a0c1ac11ad26a9737e9ca66f26d48f1db6e0c699d21261886d601cc7cf3ac3516c50e7208994f7679b2161c5d1a8f37ba174f288f889b52f838b209fe8e57eb7f52db06e9e5bd1a5ea47898dd176d7a6f52ea80fafe59829ade1fa74312e6c27503803eb627c94d21cbce7592cd08bfb263046bc25c380b17f176c988ff08a33e980d792632c6b5ee894141a4adb510150f29ff9c7dbf8e6b485fc8a5fc295e5cbb7468630657d66f1abbd1d54cf1b345');
const publicKey = hexToBytes('0x9a26bbc93aec60f45b27f6d34fc606ec9c603956e0bf10b5e8c0f2c73c982d7ea2ad601d2f5bc655abfc3cbe39f9b3df452275063e335eec843a850a2edaee0cc0e069be7f63c4956e830db7e4a9d36996f60d94a863af01c1a7d8d062acca2ea49b5c09e8b78e1467a39e84bca16b2382a850e13d16d37dc889c1cff7e6de315bf2e59c23a2e207e57f8e089df26aa7779f8b09d9ced7716b3537a354b1a20403381df6cf47d582c58bd0214669015a40e601a90c9c819bb0bf670a6b5db4c9acb351dc097dc707bbf7bb909420a9a5bb268d1b8b024970b1c338bc4d00b64ab2cd2aa21f428d4248cab85acb7057dc8709201a6df89e4f884e2e6229887ba4708ba5be3fb9873f297a665c1938f5c15deb2a1eeaf608a3214e8773241de13291e3ae53729fa326096fff54be49c1619599b763e01ae7ed35cec03980019c05a276a572989025f06230e599b5303cef5022643da83fffadfbd45907bb2f6badf1dd2d06770461348d450356929c470db070a001b68b7acfc5216379c57545ca4c4c92ae34296d5690c7d958f48956e9d49e9af4562ad2b735f00be627f8f8d9d4cd3b0ac2405fa173c4221e25fe35bdb671f6e6666a3b7b0d6030783919490a96693a3e2c571e94767cc85ce1bdccfe13f360ebc59c9f7dc050e61ede0bf6dd8f8eb48abc5695f8df4db4057bac37824056ebff2e4b75b035ee09e48973eb2d3123e8faaa5176c7fb379fcb01ff5dcf0354ee615c692baa0a6cf7bbc5e55b19bdf16cc9fe12562aa63dd3eb4522d1e6444f526b54e4bb6bb571a7177464f04f3440323c15c438fb434af19bf0eb80e1b4039a207027b96ce57afbea4ea32efc8d88b9f0484c04d2c4890c336ef2b86fef615e4860d52ee61ff8f3c7a7ef54ff3fce7dc391c3df9eb87a59c0348fb80f2d9940caf3317affdcba212229f90448e7229947c6675cac84df112cd4ed1dd7e6b1ca9afd5f291bed7670acb2d6d157baf6f0ac5401361ce9dbf8c1784e27c382f3f9d960611744c300a87b6426b27eb8b7079052d49fb2b90ce2ebd3bb40266b4d136ae6f17a772c6fead4cac29d8db21d2a6177f258817a0c6f61093e75362ce6679495c179806c5c5e9ad91274d41aa90c21949d3429bbb30873cdde7f39217eade6f5b0ade861fa8a4585e67c96ab1fbd3811ad71ad4b518ba34af8b228f6f207aefc7198d129d1ad192c56140c6bd2e2e2a17ee3d11b54876fddebf75a5c55e3d2f520a4fd2b69b09090f7a06ac116d456f87efbbe33ae3dcbc72af92b11a380f7112f744cf7b3aad3c38979d451c6b3c4092636c2d8ae5b8faf0f80585163cd08517061081900f101c96a8b5a799d73230ee44b87b81ec68cc8d494f58a579f7f41e335e788dfc7fbe2cc1ebd9650588461b420ecd80b3f94af183f3b79be8eae4cfe92a5aa80420a93ea397d737ff485f57098969060e2ead70df9c31615f9f7c45cdfdb01b7dfa6e5210293ebd0d96eb29d5b480d2ef2b2b5e1bf22857cba5def89a7d8258ccd972aea00133347156935e62e71c3d7c9da5652b5bbff64d698dd1f2c4ac5c2f6a97d44931047cf6fcfd63678e12c13d564a5354a3622cc9f1e2b23af257feb67f3dc1d6d36b702e99397743bc807b3e7f4a4f4da43a377513f702bb128204227500656aa9eb904dc1285b1e07b92a4c11e1c621e02d068fbe0aec0328a0c13868f2aeeff6347acecf8d93dd487a396ff5216e113069c3ff9a916ef01decd2b35f83d953f739fcd9118be3f9cd6cfb901c921646114a2325966388884945f3af47e2c19fd763cab978bf196bac873bc86a28ccfc05af2439860ca7185f67efc3a03ad4e7ef2470a59fff245b8ebf031b14397f4521a5176d2eac6b08ea9266a5b22df6d9f052f8c17ce14a938420b9b1e5f7712409545498b389c64717b94928f6944b99d460ce1c3e10e83be5563e1e39531fc26299dadae27f14969ea258edc85f72e687cd06b37b1b19b4430a9f52a6ba7760267fe546f45fd5eeb8ff22fd97617643337751000bd1db1e33af5bb97f4688660469343ff936b2541c71ad81e0089e011b51571c421f9c9302bbcae4829fbfc219cc91b89fbb9a8f1a6e94beabaa81be11074f2467879c1a9825979328034df71cba65db2b83c8c9f06081619ff9f822470b8311cae7dd6eb4958a865b8fb93959c803048a48e0fe183f3a9f98c688812e2f0a6d788d39b92909f2000925b52962f15423fb47a23f534bcce1c381b276e6ef02be5d4f1e87d009314dfd7d1c9e3140ad9a6607be3f83d7c12c203b650b9c0366a8ec985536655f103c7cefa59b8d19d1d9cba42c8b7c13e39433f48a0dd2723d7e9781bc4e1ce0efd1e3931852eb0c68bc4066f7e40c05ae2dbb8bcdd30438560471d7577de3ed2badf51258925abdb0008778400c5045162db94929b7b8cd897b0b3d6c18bd42a5d9e3263475bfdcd99a623b593b4d192e6e5e32497ad85ecf5c30b8fd6be6302decd51158463465e1535ac2d7b65e8ce9b2ad9e91f007351cf4b63fb0aa98f5829ba332fde36c6f560c0ac9565a621e68542f77a3626900dfc3f463f1da60fd90f51d59766fe2ee6ef5b8f8c8ec87ae112c7447b22238452993899126fa3b1314580eaff727262f16cb8f9184a43faac6c14e186269a49b4b10bf107324ab30b4234f3ecd0daa54b219b58431bffe0d85b707940b3ee08a09a76fd97854b6dae57a6eabbe85ea94635c8ec140834ffebdf517286b6be9437fa5dea2a8ed252c98dcd8d7f21c7f7135b2ecd130145a0be17c0b204ca38b0552589673c1bc1726bdbba8f91e778885d6ad10dcd32163605a9d86c8892a853ca0cc7ead126f549aad93ddc929ea27b58a6bdd99aebe7d38a0e1d7b4df145a7751bdedc8f7eb3e24ecc85720d6df7d288f8db3c3f33e0e5760f3e2ff27ae8f707a868d9e3b6b829e28bf121805cb47a3bb47577d212a5ae79364965a054249cdb54d605715974123ccbf17c4b67d654fdd7909fe3a57181cd981797d6bec8d5467b2944180aa4ea70b238284002539723ca3301315dbc83f39a57ec4604b135e24a4680935a8e3458600b20510054488b99adb581c049f2ec5cf654c9bb56cc13b323da336d9685e86c5837ae069b40d2b2431e9b7938ce6aac094c3d0939acd5c7a593ff74e04f4b5136b30ba7c800079add5d74c67cae73ff61875e92cac67e97eb430abc8567c24949af89eab06cec7a5d0e5d14ddc197c434b61c045482fec7d0fba974b69304de175d96c38d1cbcdbbd69e85a7e9d3cc45c4ee9a4251b846fd6b3bda8d44ab28147b3a2a88f6d82b322cd4fd0770b43b24b708157e7187ddafda29d86e0ae73c8de38f09afc4240829b830bb864d604e7a3e82f6fc099e0cca23e7c0bb0a91114e43381717004ac49bc3ea848141f1febb4fb6951d4861352de7899482abf7ff17db504cbb3b078e6320e3256e917b9ff7b62e41751bd92fea45e9ab835321feea2cb283eb827f0d63706165c0c22540c47c6a084e99ee908dd604be44d14b9f685786c2f2c1679980bcab402e9f7b39a9253ba93e7df3ee4e9a9923f2ecf7e13fd3000ac45bc35e1931836914ba66089168f2c1151a277c34b7e89f43f2b592d847d80ebca154d922cd0f221c3b3fdc376ec0de37f42')
const address = Address.publicToAddress(publicKey);

const common = new Common({
	chain: Chain.Mainnet,
	hardfork: Hardfork.London,
});

const txTypes = [
	{
		class: AccessListEIP2930Transaction,
		name: 'AccessListEIP2930Transaction',
		type: 1,
	},
	{
		class: FeeMarketEIP1559Transaction,
		name: 'FeeMarketEIP1559Transaction',
		type: 2,
	},
];

const validAddress = hexToBytes('01'.repeat(20));
const validSlot = hexToBytes('01'.repeat(32));
const chainId = BigInt(1);

describe('[AccessListEIP2930Transaction / FeeMarketEIP1559Transaction] -> EIP-2930 Compatibility', () => {
	it('Initialization / Getter -> fromTxData()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData({}, { common });
			expect(tx).toBeTruthy();

			tx = txType.class.fromTxData({
				chainId: 5,
			});
			expect(tx.common.chainId() === BigInt(5)).toBeTruthy();

			tx = txType.class.fromTxData({
				chainId: 99999,
			});
			expect(tx.common.chainId() === BigInt(99999)).toBeTruthy();

			const nonEIP2930Common = new Common({
				chain: Chain.Mainnet,
				hardfork: Hardfork.Istanbul,
			});
			expect(() => {
				txType.class.fromTxData({}, { common: nonEIP2930Common });
			}).toThrow();

			expect(() => {
				txType.class.fromTxData(
					{
						chainId: chainId + BigInt(1),
					},
					{ common },
				);
			}).toThrow();

			// TODO (rgeraldes24)
			// expect(() => {
			// 	txType.class.fromTxData(
			// 		{
			// 			v: 2,
			// 		},
			// 		{ common },
			// 	);
			// }).toThrow();
		}
	});

	it('cannot input decimal values', () => {
		const values = ['chainId', 'nonce', 'gasPrice', 'gasLimit', 'value', 'v', 'r', 's'];
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
					AccessListEIP2930Transaction.fromTxData(txData);
				}).toThrow();
			}
		}
	});

	it('Initialization / Getter -> fromSerializedTx()', () => {
		for (const txType of txTypes) {
			expect(() => {
				txType.class.fromSerializedTx(new Uint8Array([99]), {});
			}).toThrow('wrong tx type');

			expect(() => {
				// Correct tx type + RLP-encoded 5
				const serialized = uint8ArrayConcat(
					new Uint8Array([txType.type]),
					new Uint8Array([5]),
				);
				txType.class.fromSerializedTx(serialized, {});
			}).toThrow('must be array');

			expect(() => {
				const serialized = uint8ArrayConcat(
					new Uint8Array([txType.type]),
					hexToBytes('c0'),
				);
				txType.class.fromSerializedTx(serialized, {});
			}).toThrow('values (for unsigned tx)');
		}
	});

	it('Access Lists -> success cases', () => {
		for (const txType of txTypes) {
			const access: AccessList = [
				{
					address: bytesToHex(validAddress),
					storageKeys: [bytesToHex(validSlot)],
				},
			];
			const txn = txType.class.fromTxData(
				{
					accessList: access,
					chainId: 1,
				},
				{ common },
			);

			// Check if everything is converted

			const Uint8Array = txn.accessList;
			const JSON = txn.AccessListJSON;

			expect(uint8ArrayEquals(Uint8Array[0][0], validAddress)).toBeTruthy();
			expect(uint8ArrayEquals(Uint8Array[0][1][0], validSlot)).toBeTruthy();

			expect(JSON).toEqual(access);

			// also verify that we can always get the json access list, even if we don't provide one.

			const txnRaw = txType.class.fromTxData(
				{
					accessList: Uint8Array,
					chainId: 1,
				},
				{ common },
			);

			const JSONRaw = txnRaw.AccessListJSON;

			expect(JSONRaw).toEqual(access);
		}
	});

	it('Access Lists -> error cases', () => {
		for (const txType of txTypes) {
			let accessList: any[] = [
				[
					hexToBytes('01'.repeat(21)), // Address of 21 bytes instead of 20
					[],
				],
			];

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [
				[
					validAddress,
					[
						hexToBytes('01'.repeat(31)), // Slot of 31 bytes instead of 32
					],
				],
			];

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[]]; // Address does not exist

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress]]; // Slots does not exist

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress, validSlot]]; // Slots is not an array

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();

			accessList = [[validAddress, [], []]]; // 3 items where 2 are expected

			expect(() => {
				txType.class.fromTxData({ chainId, accessList }, { common });
			}).toThrow();
		}
	});

	it('sign()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData(
				{
					data: hexToBytes('010200'),
					to: validAddress,
					accessList: [[validAddress, [validSlot]]],
					chainId,
				},
				{ common },
			);
			let signed = tx.sign(secretKey, publicKey);
			const signedAddress = signed.getSenderAddress();
			expect(uint8ArrayEquals(signedAddress.buf, address)).toBeTruthy();
			// expect(signedAddress).toEqual(Address.publicToAddress(Buffer.from(address)));
			signed.verifySignature(); // If this throws, test will not end.

			tx = txType.class.fromTxData({}, { common });
			signed = tx.sign(secretKey, publicKey);

			expect(tx.accessList).toEqual([]);
			expect(signed.accessList).toEqual([]);

			tx = txType.class.fromTxData({}, { common });

			expect(() => {
				tx.hash();
			}).toThrow();

			expect(() => {
				tx.getSenderPublicKey();
			}).toThrow();

			expect(() => {
				const high = SECP256K1_ORDER_DIV_2 + BigInt(1);
				const _tx = txType.class.fromTxData({ s: high, r: 1, v: 1 }, { common });
				const _signed = _tx.sign(secretKey, publicKey);
				_signed.getSenderPublicKey();
			}).toThrow();
		}
	});

	it('getDataFee()', () => {
		for (const txType of txTypes) {
			let tx = txType.class.fromTxData({}, { common });
			expect(tx.getDataFee()).toEqual(BigInt(0));

			tx = txType.class.fromTxData({}, { common, freeze: false });
			expect(tx.getDataFee()).toEqual(BigInt(0));

			const mutableCommon = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.London });
			tx = txType.class.fromTxData({}, { common: mutableCommon });
			tx.common.setHardfork(Hardfork.Istanbul);
			expect(tx.getDataFee()).toEqual(BigInt(0));
		}
	});
});

describe('[AccessListEIP2930Transaction] -> Class Specific Tests', () => {
	it('Initialization', () => {
		const tx = AccessListEIP2930Transaction.fromTxData({}, { common });
		expect(AccessListEIP2930Transaction.fromTxData(tx, { common })).toBeTruthy();

		const _validAddress = hexToBytes('01'.repeat(20));
		const _validSlot = hexToBytes('01'.repeat(32));
		const _chainId = BigInt(1);
		expect(() => {
			AccessListEIP2930Transaction.fromTxData(
				{
					data: hexToBytes('010200'),
					to: _validAddress,
					accessList: [[_validAddress, [_validSlot]]],
					chainId: _chainId,
					gasLimit: MAX_UINT64,
					gasPrice: MAX_INTEGER,
				},
				{ common },
			);
		}).toThrow('gasLimit * gasPrice cannot exceed MAX_INTEGER');

		const uint8Array = new Uint8Array([]);
		const _address = new Uint8Array([]);
		const storageKeys = [new Uint8Array([]), new Uint8Array([])];
		const aclBuf: AccessListUint8ArrayItem = [_address, storageKeys];
		expect(() => {
			AccessListEIP2930Transaction.fromValuesArray(
				[
					uint8Array,
					uint8Array,
					uint8Array,
					uint8Array,
					uint8Array,
					uint8Array,
					uint8Array,
					[aclBuf],
					uint8Array,
				],
				{},
			);
		}).toThrow();
	});

	it('should return right upfront cost', () => {
		let tx = AccessListEIP2930Transaction.fromTxData(
			{
				data: hexToBytes('010200'),
				to: validAddress,
				accessList: [[validAddress, [validSlot]]],
				chainId,
			},
			{ common },
		);
		// Cost should be:
		// Base fee + 2*TxDataNonZero + TxDataZero + AccessListAddressCost + AccessListSlotCost
		const txDataZero = Number(common.param('gasPrices', 'txDataZero'));
		const txDataNonZero = Number(common.param('gasPrices', 'txDataNonZero'));
		const accessListStorageKeyCost = Number(
			common.param('gasPrices', 'accessListStorageKeyCost'),
		);
		const accessListAddressCost = Number(common.param('gasPrices', 'accessListAddressCost'));
		const baseFee = Number(common.param('gasPrices', 'tx'));
		const creationFee = Number(common.param('gasPrices', 'txCreation'));

		expect(
			tx.getBaseFee() ===
				BigInt(
					txDataNonZero * 2 +
						txDataZero +
						baseFee +
						accessListAddressCost +
						accessListStorageKeyCost,
				),
		).toBeTruthy();

		// In this Tx, `to` is `undefined`, so we should charge homestead creation gas.
		tx = AccessListEIP2930Transaction.fromTxData(
			{
				data: hexToBytes('010200'),
				accessList: [[validAddress, [validSlot]]],
				chainId,
			},
			{ common },
		);

		expect(
			tx.getBaseFee() ===
				BigInt(
					txDataNonZero * 2 +
						txDataZero +
						creationFee +
						baseFee +
						accessListAddressCost +
						accessListStorageKeyCost,
				),
		).toBeTruthy();

		// Explicitly check that even if we have duplicates in our list, we still charge for those
		tx = AccessListEIP2930Transaction.fromTxData(
			{
				to: validAddress,
				accessList: [
					[validAddress, [validSlot]],
					[validAddress, [validSlot, validSlot]],
				],
				chainId,
			},
			{ common },
		);

		expect(
			tx.getBaseFee() ===
				BigInt(baseFee + accessListAddressCost * 2 + accessListStorageKeyCost * 3),
		).toBeTruthy();
	});

	it('getUpfrontCost() -> should return upfront cost', () => {
		const tx = AccessListEIP2930Transaction.fromTxData(
			{
				gasPrice: 1000,
				gasLimit: 10000000,
				value: 42,
			},
			{ common },
		);
		expect(tx.getUpfrontCost()).toEqual(BigInt(10000000042));
	});

	it('unsigned tx -> getMessageToSign()', () => {
		const unsignedTx = AccessListEIP2930Transaction.fromTxData(
			{
				data: hexToBytes('010200'),
				to: validAddress,
				accessList: [[validAddress, [validSlot]]],
				chainId,
			},
			{ common },
		);
		const expectedHash = hexToBytes(
			'0x78528e2724aa359c58c13e43a7c467eb721ce8d410c2a12ee62943a3aaefb60b',
		);
		expect(unsignedTx.getMessageToSign(true)).toEqual(expectedHash);

		const expectedSerialization = hexToBytes(
			'0x01f858018080809401010101010101010101010101010101010101018083010200f838f7940101010101010101010101010101010101010101e1a00101010101010101010101010101010101010101010101010101010101010101',
		);
		expect(unsignedTx.getMessageToSign(false)).toEqual(expectedSerialization);
	});

	// Data from
	// https://github.com/INFURA/go-ethlibs/blob/75b2a52a39d353ed8206cffaf68d09bd1b154aae/eth/transaction_signing_test.go#L87

	it('should sign transaction correctly and return expected JSON', () => {
		const _address = hexToBytes('0000000000000000000000000000000000001337');
		const slot1 = hexToBytes(
			'0000000000000000000000000000000000000000000000000000000000000000',
		);
		const txData = {
			data: hexToBytes(''),
			gasLimit: 0x62d4,
			gasPrice: 0x3b9aca00,
			nonce: 0x00,
			to: new Address(hexToBytes('df0a88b2b68c673713a8ec826003676f272e3573')),
			value: 0x01,
			chainId: uint8ArrayToBigInt(hexToBytes('796f6c6f763378')),
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			accessList: <any>[[_address, [slot1]]],
		};

		const customChainParams = {
			name: 'custom',
			chainId: txData.chainId,
			eips: [2718, 2929, 2930],
		};
		const usedCommon = Common.custom(customChainParams, {
			baseChain: Chain.Mainnet,
			hardfork: Hardfork.Berlin,
		});
		usedCommon.setEIPs([2718, 2929, 2930]);

		const expectedUnsignedRaw = hexToBytes(
			'01f86587796f6c6f76337880843b9aca008262d494df0a88b2b68c673713a8ec826003676f272e35730180f838f7940000000000000000000000000000000000001337e1a00000000000000000000000000000000000000000000000000000000000000000808080',
		);
		const pkey = hexToBytes('fad9c8855b740a0b7ed4c221dbad0f33a83a49cad6b3fe8d5817ac83d38b6a19');
		const expectedSigned = hexToBytes(
			'01f8a587796f6c6f76337880843b9aca008262d494df0a88b2b68c673713a8ec826003676f272e35730180f838f7940000000000000000000000000000000000001337e1a0000000000000000000000000000000000000000000000000000000000000000080a0294ac94077b35057971e6b4b06dfdf55a6fbed819133a6c1d31e187f1bca938da00be950468ba1c25a5cb50e9f6d8aa13c8cd21f24ba909402775b262ac76d374d',
		);
		const expectedHash = hexToBytes(
			'bbd570a3c6acc9bb7da0d5c0322fe4ea2a300db80226f7df4fef39b2d6649eec',
		);
		const v = BigInt(0);
		const r = uint8ArrayToBigInt(
			hexToBytes('294ac94077b35057971e6b4b06dfdf55a6fbed819133a6c1d31e187f1bca938d'),
		);
		const s = uint8ArrayToBigInt(
			hexToBytes('0be950468ba1c25a5cb50e9f6d8aa13c8cd21f24ba909402775b262ac76d374d'),
		);

		const unsignedTx = AccessListEIP2930Transaction.fromTxData(txData, { common: usedCommon });

		const serializedMessageRaw = unsignedTx.serialize();

		expect(uint8ArrayEquals(expectedUnsignedRaw, serializedMessageRaw)).toBeTruthy();

		const signed = unsignedTx.sign(secretKey, publicKey);

		expect(v === signed.v!).toBeTruthy();
		expect(r === signed.r!).toBeTruthy();
		expect(s === signed.s!).toBeTruthy();
		expect(uint8ArrayEquals(expectedSigned, signed.serialize())).toBeTruthy();
		expect(uint8ArrayEquals(expectedHash, signed.hash())).toBeTruthy();

		const expectedJSON = {
			chainId: '0x796f6c6f763378',
			nonce: '0x0',
			gasPrice: '0x3b9aca00',
			gasLimit: '0x62d4',
			to: '0xdf0a88b2b68c673713a8ec826003676f272e3573',
			value: '0x1',
			data: '0x',
			accessList: [
				{
					address: '0x0000000000000000000000000000000000001337',
					storageKeys: [
						'0x0000000000000000000000000000000000000000000000000000000000000000',
					],
				},
			],
			v: '0x0',
			r: '0x294ac94077b35057971e6b4b06dfdf55a6fbed819133a6c1d31e187f1bca938d',
			s: '0xbe950468ba1c25a5cb50e9f6d8aa13c8cd21f24ba909402775b262ac76d374d',
		};

		expect(signed.toJSON()).toEqual(expectedJSON);
	});

	it('freeze property propagates from unsigned tx to signed tx', () => {
		const tx = AccessListEIP2930Transaction.fromTxData({}, { freeze: false });
		expect(Object.isFrozen(tx)).toBe(false);
		const signedTxn = tx.sign(secretKey, publicKey);
		expect(Object.isFrozen(signedTxn)).toBe(false);
	});

	it('common propagates from the common of tx, not the common in TxOptions', () => {
		const txn = AccessListEIP2930Transaction.fromTxData({}, { common, freeze: false });
		const newCommon = new Common({
			chain: Chain.Mainnet,
			hardfork: Hardfork.London,
			eips: [2537],
		});
		expect(newCommon).not.toEqual(common);
		Object.defineProperty(txn, 'common', {
			get() {
				return newCommon;
			},
		});
		const signedTxn = txn.sign(secretKey, publicKey);
		expect(signedTxn.common.eips().includes(2537)).toBeTruthy();
	});
});
