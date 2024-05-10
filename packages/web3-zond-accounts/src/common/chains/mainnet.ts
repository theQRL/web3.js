export default {
	"name": "mainnet",
	"chainId": 1,
	"networkId": 1,
	"defaultHardfork": "shanghai",
	"consensus": {
		"type": "pos",
		"algorithm": "casper",
		"casper": {}
	},
	"comment": "The Zond main chain",
	"url": "https://ethstats.net/",
	"genesis": {
		"gasLimit": 5000,
		"extraData": "0x11bbe8db4e347b4e8c937c1c8370e4b5ed33adb3db69cbdb7a38e1e50b1b82fa"
	},
	"hardforks": [
		{
			"name": "chainstart",
			"block": 0,
			"forkHash": "0xfc64ec04"
		},
		{
			"name": "shanghai",
			"block": null,
			"forkHash": null
		}
	],
	"bootstrapNodes": [],
	"dnsNetworks": [
		"enrtree://AKA3AM6LPBYEUDMVNU3BSVQJ5AD45Y7YPOHJLEF6W26QOE4VTUDPE@all.mainnet.ethdisco.net"
	]
}
 ;