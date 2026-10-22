---
sidebar_position: 2
sidebar_label: 'Providers'
---

# web3.js Providers Guide

## Introduction

web3.js providers are objects responsible for enabling connectivity with the QRL network in various ways. Connecting your web application to a QRL node is necessary for sending transactions, querying data, and interacting with smart contracts on the network. In this guide, we will explore the different types of providers available in web3.js, how to set them up, and how to use them in your code.

Connecting to a chain happens through a provider. You can pass the provider to the constructor as in the following example:

```ts
import Web3 from '@theqrl/web3';

const web3 = new Web3(/* PROVIDER*/);

// calling any method that interact with the network would involve using the early passed provider.
await web3.qrl.sendTransaction({
	from,
	to,
	value,
});
```

The created Web3 instance will use the passed provider to interact with the blockchain network. This interaction happen when sending a request and receiving the response, and when possibly listen to provider events (if the provider support this).

## Providers Types

Actually, the provider could be any of the following:

-   An instance of [HttpProvider](/api/@theqrl/web3-providers-http/classes/HttpProvider)
-   An instance of [WebSocketProvider](/api/@theqrl/web3-providers-ws/classes/WebSocketProvider)
-   An instance of [IpcProvider](/api/@theqrl/web3-providers-ipc/classes/IpcProvider)
-   A string containing string url for `http`/`https` or `ws`/`wss` protocol. And when a string is passed, an instance of the compatible class above will be created accordingly. ex. WebSocketProvider instance will be created for string containing `ws` or `wss`. And you access this instance by calling `web3.provider` to read the provider and possibly register an event listener. Only HTTP(S) and WS(S) URLs are auto-detected: an IPC socket path is not, so an `IpcProvider` must always be constructed explicitly (see the [Local Gqrl Node](#local-gqrl-node) example).
-   Any provider object that adheres to [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) and speaks QRL-compatible JSON-RPC.

For both [WebSocketProvider](/api/@theqrl/web3-providers-ws/classes/WebSocketProvider) and [IpcProvider](/api/@theqrl/web3-providers-ipc/classes/IpcProvider) the user can listen to emitted events. More on this is at [Providers Events Listening](events_listening).

:::tip
The passed provider can be either type `string` or one of the [`SupportedProviders`](/api/@theqrl/web3-types/type-aliases/SupportedProviders). And if it is passed as a string, then internally the compatible provider object will be created and used.
:::

## Providers Priorities

There are multiple ways to set the provider.

```ts title='Setting a provider'
web3.setProvider(myProvider);
web3.qrl.setProvider(myProvider);
contractInstance.setProvider(myProvider);
```

The key rule for setting provider is as follows:

1. Any provider set on the higher level will be applied to all lower levels. e.g. Any provider set using `web3.setProvider` will also be applied to the `web3.qrl` object and to the contracts created with `new web3.qrl.Contract(...)`, because they share the `web3` context.
2. A single contract instance can be given its own provider with `contractInstance.setProvider(myProvider)`. There is no static `Contract.setProvider`: a provider is set either on an instance or on the `web3` context it was created from.

---

## Examples

### Local Gqrl Node

```ts
const { Web3 } = require('@theqrl/web3');
const web3 = new Web3('http://localhost:8545');
// or
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

// change provider
web3.setProvider('ws://localhost:8546');
// or
web3.setProvider(new Web3.providers.WebsocketProvider('ws://localhost:8546'));
```

The IPC transport is a separate, Node.js-only package (`@theqrl/web3-providers-ipc`) and is never created from a string. `Web3.providers` only lists `HttpProvider` and `WebsocketProvider`; construct the `IpcProvider` yourself and pass the instance:

```ts
const { Web3 } = require('@theqrl/web3');
const { IpcProvider } = require('@theqrl/web3-providers-ipc');

const web3 = new Web3(new IpcProvider('/Users/myuser/Library/QRL/Execution/gqrl.ipc')); // mac os path
// on windows the path is: "\\\\.\\pipe\\gqrl.ipc"
// on linux the path is: "/users/myuser/.qrl/execution/gqrl.ipc"

// the same instance can be set later
web3.setProvider(new IpcProvider('/users/myuser/.qrl/execution/gqrl.ipc'));
```

The socket is opened with Node's `net` module internally; nothing else needs to be passed. Browser bundles cannot use the IPC provider: the runtime packages are bundler-safe (they load no Node built-in modules), and `@theqrl/web3-providers-ipc` is the one package that intentionally depends on Node.

### Remote Node Provider

```ts
// Using a remote node provider
const { Web3 } = require('@theqrl/web3');
const web3 = new Web3('https://url-to-remote-node');
```

### Injected Providers

As stated above, the injected provider should comply with [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) and expose QRL-compatible JSON-RPC methods.

The web3.js Provider specifications are defined in [web3 base provider](https://github.com/theqrl/web3.js/blob/main/packages/web3-types/src/web3_base_provider.ts) for Injected Providers.

```html
<script src="https://cdn.jsdelivr.net/npm/@theqrl/web3/dist/web3.min.js"></script>
<script>
	window.addEventListener('load', function () {
		// Check if web3 is available
		if (typeof window.qrl !== 'undefined') {
			// Use the browser injected QRL provider
			web3 = new Web3(window.qrl);
			// Request access to the user's QRL account
			window.qrl.enable();
			// Get the user's accounts
			web3.qrl.getAccounts().then(function (accounts) {
				// Show the first account
				document.getElementById('log').innerHTML =
					'Connected with QRL account: ' + accounts[0];
			});
		} else {
			// If the provider is not available, give instructions to install a QRL-compatible wallet
			document.getElementById('log').innerHTML =
				'Please install a QRL-compatible browser wallet to connect with the QRL network';
		}
	});
</script>
```

Note that the above code should be hosted in a web server (that could be a simple local web server), because many browser does not support this feature for static files located on your machine.

### Provider Options

There are differences in the objects that could be passed in the Provider constructors.

#### HttpProvider

The options is of type `HttpProviderOptions`, which is an object with a single key named `providerOptions` and its value is an object of type `RequestInit`.
Regarding `RequestInit` see [mdn docs](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit).

For example:

```ts
const httpOptions = {
	providerOptions: {
		body: undefined,
		cache: 'force-cache',
		credentials: 'same-origin',
		headers: {
			'Content-Type': 'application/json',
		},
		integrity: 'foo',
		keepalive: true,
		method: 'GET',
		mode: 'same-origin',
		redirect: 'error',
		referrer: 'foo',
		referrerPolicy: 'same-origin',
		signal: undefined,
		window: undefined,
	} as RequestInit,
};
```

#### WebSocketProvider

Use WebSocketProvider to connect to a Node using a WebSocket connection, i.e. over the `ws` or `wss` protocol.

The options object is of type `ClientRequestArgs` or of `ClientOptions`. See [here](https://docs.deno.com/api/node/http/~/ClientRequestArgs) for `ClientRequestArgs` and [here](https://github.com/websockets/ws) for `ClientOptions`.

The second option parameter can be given regarding reconnecting. And here is its type:

```ts
// this is the same options interface used for both WebSocketProvider and IpcProvider
type ReconnectOptions = {
	autoReconnect: boolean; // default: `true`
	delay: number; // default: `5000`
	maxAttempts: number; // default: `5`
};
```

And here is a sample instantiation for the `WebSocketProvider`:

```ts
const provider = new WebSocketProvider(
	`ws://localhost:8545`,
	{
		headers: {
			// to provide the API key if the Node requires the key to be inside the `headers` for example:
			'x-api-key': '<Api key>',
		},
	},
	{
		delay: 500,
		autoReconnect: true,
		maxAttempts: 10,
	},
);
```

The second and the third parameters are both optional. And, for example, the second parameter could be an empty object or undefined, like in the following example:

```ts
const provider = new WebSocketProvider(
	`ws://localhost:8545`,
	{},
	{
		delay: 500,
		autoReconnect: true,
		maxAttempts: 10,
	},
);
```

##### Options example

Below is an example for the passed options:

```ts
let clientOptions: ClientOptions = {
	// Useful for credentialed urls, e.g: ws://username:password@localhost:8546
	headers: {
		authorization: 'Basic username:password',
	},
	maxPayload: 100000000,
};

const reconnectOptions: ReconnectOptions = {
	autoReconnect: true,
	delay: 5000,
	maxAttempts: 5,
};
```

### IpcProvider

The IPC Provider could be used in node.js dapps when running a local node. And it provide the most secure connection.

It accepts a second parameter called `socketOptions`. And, its type is `SocketConstructorOpts`. See [here](https://docs.deno.com/api/node/net/~/SocketConstructorOpts) for details. And here is its interface:

```ts
interface SocketConstructorOpts {
	fd?: number | undefined;
	allowHalfOpen?: boolean | undefined;
	readable?: boolean | undefined;
	writable?: boolean | undefined;
}
```

And, the third parameter is called `reconnectOptions` that is of the type `ReconnectOptions`. It can be given to control: auto-reconnecting, delay and max tries attempts. And here its type:

```ts
// this is the same options interface used for both WebSocketProvider and IpcProvider
type ReconnectOptions = {
	autoReconnect: boolean; // default: `true`
	delay: number; // default: `5000`
	maxAttempts: number; // default: `5`
};
```

##### Options examples

Below is an example for the passed options for each version:

```ts
let clientOptions: SocketConstructorOpts = {
	allowHalfOpen: false;
	readable: true;
	writable: true;
};

const reconnectOptions: ReconnectOptions = {
	autoReconnect: true,
	delay: 5000,
	maxAttempts: 5,
};
```

And here is a sample instantiation for the `IpcProvider`:

```ts
const provider = new IpcProvider(
	`path.ipc`,
	{
		writable: false,
	},
	{
		delay: 500,
		autoReconnect: true,
		maxAttempts: 10,
	},
);
```

The second and the third parameters are both optional. And, for example, the second parameter could be an empty object or undefined.

```ts
const provider = new IpcProvider(
	`path.ipc`,
	{},
	{
		delay: 500,
		autoReconnect: true,
		maxAttempts: 10,
	},
);
```

#### Error message for reconnect attempts

:::info
This section applies for both `IpcProvider` and `WebSocketProvider`.
:::

The error message, for the max reconnect attempts, will contain the value of the variable `maxAttempts` as follows:

`` `Maximum number of reconnect attempts reached! (${maxAttempts})` ``

And here is how to catch the error, if max attempts reached when there is auto reconnecting:

```ts
provider.on('error', error => {
	if (error.message.startsWith('Maximum number of reconnect attempts reached!')) {
		// the `error.message` will be `Maximum number of reconnect attempts reached! (${maxAttempts})`
		// the `maxAttempts` is equal to the provided value by the user, or the default value `5`.
	}
});
```
