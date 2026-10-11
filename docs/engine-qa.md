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

## Clock ticks schedule (#198)

**Status: the funded rerun on the fixed head is recorded.** Kernel reran it on
2026-10-11 at commit `0d66a487f299c09cb29b95dcaf23531c52be9377` (#241). The signer is
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`.

Run 1 (`5WhMikBC…`) found the hold about 46% over and the settle measuring the
wrong side. `0d66a48` fixed both.

Schedule Strategy `01M4NH04T767VCR5WBF5AT33VP` ran one Tick,
`01M4NH27BF9MCGW6MPNB4K9H2F`, with outcome `executed`. It then went to done with
`nextDueAt` null. There was no second spend.

Ledger `res_1` is settled: hold $1.109163, settle $1.103702, no overshoot. At the
implied price of $109.2233 per SOL, the hold equals 0.01 × P × 1.005 ($1.097694)
plus the 105,000-lamport fee ($0.011468), and the settle equals (0.01 + 0.000105)
× P. The USDC received, worth $1.093419, is not what the settle used.

The tick swap paid a 105,000-lamport fee. Signature
`3uhe1jeAQXAAHJ8rCDJhshCTtK7W4FC5mkkYmT3UMFaMgBfN3TVfL9F7CHg577eQVtqrN3aDFGr239mqV6cWmi7N`.
`err` null.

The swap-back of 1.093419 USDC ran through the direct CLI with simulate first, not
the Engine. It paid a 105,000-lamport fee. Signature
`Ne1Z9YKfBd8CHmK6WDYNx4AgUGMGdXqsvz5eBafaRczTvyC86ggesxkfUfmUwjyAC6CUHKAGMGuX29PT4HUpkrP`.
`err` null.

SOL 1.507414656 → 1.497309656 → 1.507204462. USDC 21.885179 → 22.978598 →
21.885179. Net cost 210,194 lamports: 210,000 in fees and 194 lost to spread.

## Clock ticks schedule, QA wallet (#198)

**Status: the failed-landing case is kept, and one pass is recorded.** Both ran
at commit `b2e2d44213a8ac9e9f5588e179945f72758ce896` (#241). The signer is QA
wallet `DfWpQReRKLMkwYa9kXf3BLMCkm42HwT1zDokzGgaerFw`. It replaces `E15BHE3…`
for funded QA.

The failed-landing case is kept on purpose as evidence. Strategy
`01M4NRWXBW691QZRRZKFB5TZ0A`, Tick `01M4NRYV2J2DW6EQQSAAQY2M27`, maxSlippageBps
50. The swap simulated OK, then landed failed with `InstructionError [4, Custom
6001]` (likely Jupiter slippage). Signature
`2TKmBpyY13XwKy3MaiyA38nMRDqJJsohCAFGug1wvGHPrjLi9KieX75GvSCfDck2PQVHqf1tE4Rv8PunzRVckfWr`.
The ledger has one hold of $1.1137, settled $0.0115 (meta.fee only). The Tick
is `failed`. The failed transaction cost 105,000 lamports. The Engine stopped
before retry. Restarts were not exercised in this run.

The pass used a fresh data dir and maxSlippageBps 100. Strategy
`01M4NS8754XNGJ0XXDNVRSCT9C`, Tick `01M4NSA4VPEJW3X5VH2BJV6BAA`, outcome
`executed` on the first try. Observations `{lamports:911193959}`. Intent
`01M4NS8754XNGJ0XXDNVRSCT9C.01M4NSA4VPEJW3X5VH2BJV6BAA.0` settled. Signature
`27kYPkRYtFNeSru4RHRgHaU6wLjuuSB1iWfYLqgYsxq27iZVLAyyfRBpsxe2QCxhorVvK4N2Fe7LSSkHvHoBaN5i`.
Slot 455701020, err null, fee 105,000 lamports, +1.098391 USDC.

Two restarts, each a SIGTERM, a start, and a wait of about 75 seconds. Both
times the Strategy was still `done`, `nextDueAt` null, one Tick, and the SQLite
tick count was 1. The ledger has one row, `res_1`, and no second hold. The hold
is $1.120617 = P × 0.010205 (input × 1.01 + fee). The settle is $1.109636 =
(0.01 + 0.000105) × P. Both are consistent at P ≈ $109.81.

Tick transaction balance changes were measured from `getTransaction` meta
(jsonParsed, maxSupportedTransactionVersion 1) at slot 455701020. The signer
went 911,193,959 → 899,600,519 (−11,593,440 = 105,000 fee + 10,000,000 input +
1,488,440 rent). USDC ATA `8XXiG4qgQ9uhd4EnPNzTwZvqUaWnxgzoJdEMzdMN2Jb9` pre 0
post 1,488,440. Temporary wSOL ATA `6man8AD8s5XuzUTbeTfVMnDvRuPBaaQ1W5rhrUdCnz2i`
pre 0 post 0 (created and closed in the same transaction).

The swap back signature is
`vLpPomz24nLongn3GzkHpeK1bAKRCRpoQhYdu5rCnynRFWKYTFNdHwQVSorumDXdE6SAe4E6LuR3zsenSej34Si`.
The USDC account closed signature is
`4EqHbhP9de7njvc6ALNQt416frUrduPohaiXZuo79tyiN1dKBj8JpMZf6wDVLqJv81e28u9pNYSgWjGtbVpJfUq2`.
Round SOL 911,193,959 → 910,971,092. Net cost 222,867 lamports.

A kill between settle and Tick save was not exercised live. That window is
milliseconds inside one process and needs a test hook. The recovery unit tests
cover it.
