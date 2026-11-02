# Hyperion ABI compatibility fixtures

`hyperion-0.2.0.json` is shared with go-qrl's
`accounts/abi/testdata/hyperion-0.2.0.json`. Keep both copies identical.

The fixture was compiled from `AbiCompatibility.hyp` using
`0.2.0+commit.e36a0aea.Emscripten.clang` with optimization enabled (200 runs).
The complete compiler input, deployed bytecode, and method selectors are stored
in the JSON. The expected bytes were obtained by executing that bytecode in
go-qrl's VM at commit `92d0369f9dd0b32b0cd6b4a5eee308baeb592967`.

Each successful method returns `bytes`: remove the outer ABI encoding of that
return value to obtain `encoded`. Panic cases store the raw revert payload.
The go-qrl test executes the stored bytecode again and checks these outputs;
both SDKs check their own encoding and decoding against the same vectors.
Packed cases are checked by web3.js and by execution in go-qrl.

To regenerate, compile the stored `compilerInput` with the specified compiler,
update `bytecode` from `qrvm.deployedBytecode.object` and each `callData` from
`qrvm.methodIdentifiers`, then execute every case with `runtime.Execute` using
a gas limit of 10,000,000. Update the expected values from the resulting VM
output, not from an SDK encoder.

The cases cover 256-bit integer aliases, explicit 512-bit integers, external
function values with dynamic arguments, fixed and dynamic function arrays,
functions in dynamic tuples, packed scalars and arrays, and compiler panics.
