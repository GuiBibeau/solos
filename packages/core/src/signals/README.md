# signals

Ports only. A `SignalSource` is any live feed (X posts, price alerts, custom webhooks) exposed
as an Effect `Stream` of `Signal`.

No adapters exist yet. The first candidates are the X API and a Pyth price stream; each lands in
`packages/solana` (on-chain) or a new feeds package (off-chain) as a `Layer` providing this port.
