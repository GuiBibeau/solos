# Engine live round

## Engine transfer SOL (#194)

**Status: one funded mainnet transfer is recorded.** Kernel ran it from Gui's Mac
on 2026-10-10, Engine `--tier execute` at commit
`359a3254f98aab3c4b2418e7c40236219f2dc77c`, through CLI `transfer sol` with
`SOLOS_EXECUTOR=engine`. The signer is
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`. The recipient is
`8m23JRic714aXZQmDXawzXo6YUN9R4qN5z5BLHUZtLBi`, the destination account key on
each signature.

Each send moved 0.001 SOL. The fee was 6,000 lamports on each transaction.
Wallet history shows exactly three transfers, one per intent, none duplicated.

From before the first send to after the third:

- signer 1.769798929 → 1.766780929 SOL (−0.003018)
- recipient 0.963812096 → 0.966812096 SOL (+0.003)
- fees 6,000 lamports × 3 = 0.000018 SOL

The first send simulated at 150 compute units, then the intent settled.
Signature
`ebBhZZQFhBAMY9N4qHXFENumgWKWgTvJdG8f8844fM1BpGMBfUEzhipvpQJzUcupLhmzqBJgfnLkpm6bPciZCM8`.
Slot 455186585, block time 2026-10-10T08:18:05Z. Chain compute units consumed
were 150.

The next send was a restart killed after the transfer had already confirmed, so
it was its own transfer. A retry of that finished intent returned the same
signature and did not send again. Signature
`MgKzW5PJwUqBGCc4rszSVsFJJHXJMDabsLKh4qh9MKwMxBMoxnpAN7qFNRwfgCvKifrXD5jx1M2gJWQDqd5Mh7r`.
Slot 455186648, block time 2026-10-10T08:18:19Z. Chain compute units consumed
were 150. Simulation compute units were not recorded for this send. The intent
id was not recorded.

Intent `qa234-restart-2` was in flight with its signature saved when the Engine
was killed with `kill -9`. The client got no response. After restart, the intent
lookup marked it settled from chain. A retry of the same intent returned the
same signature and did not send again. Signature
`kqGn4T6k38u29HYLhJ7WTnoViGrjoRbP5EERZziAoEAUzn3vKDN9f1qymBJG89nYnoraVKQVVeGDECUGvhuouj2`.
Slot 455186752, block time 2026-10-10T08:18:41Z. Chain compute units consumed
were 150. Simulation compute units were not recorded for this send.

Slot, block time, consumed compute units, and the recipient address were read
with `getTransaction` on these signatures. The feature-map row has no slot or
timestamp key, so those figures stay in this note. Each send's signer lamport
delta on chain was −1,006,000 (−0.001006 SOL): the 0.001 SOL transfer plus the
6,000 lamport fee. Those three deltas sum to the signer line above, and the
recipient gained 1,000,000 lamports on each send.
