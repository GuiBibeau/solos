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

## Durable cap ledger and kill switch (#195)

**Status: recorded.** Kernel ran it from Gui's Mac
on 2026-10-10, Engine execute tier, at commit
`0e8eb3bd8c685c8b24e49509c2a8eecc05778e83` (PR #243, merged as
`7baa1ac54dbb85ee1195cc687d0d086bb28a83d4`). `transfer_sol` went through
Strategies with a durable SQLite cap ledger. `--allowed-mints` was wrapped SOL
and USDC. SOL was priced about $110. The signer is
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`. The recipient is
`8m23JRic714aXZQmDXawzXo6YUN9R4qN5z5BLHUZtLBi`, the destination account key on
each signature.

Strategy A (per tick $2, per day $4). 0.01 SOL on tick-1 confirmed. Signature
`2Y2pghoHccYYGcBnh1ndT1VjoeNUczgBMVeQE1jvux5waSfGbzqYFmWGsicfcYACqBm8rpHXnM2uy7f5pepXZZoR`.
A repeat of the same intentId returned the same signature and sent nothing. A
second 0.01 SOL on tick-1 got 422 `maxNotionalPerTickUsd` (requested $2.204),
with no signature. 0.01 SOL on tick-2 confirmed. Signature
`APnNCEARfm18mufc8jC8aJA59a1FJyQ9CRN7YiPyYTxFqnPgpXgo3ZLDfL18un1WB2yZuoDnLJndykCEzFnEFSH`.
0.01 SOL on tick-3 confirmed. Signature
`2qTw96DrvbAsXnWzGtNDCDcFJUdtKzqb2KgHALc9Y5KXwpVn2ZJbvBzVWnkMFtjHwMhhTvAJPwQ2JFAB9d4iCuVz`.
tick-4 got 422 `maxDailySpendUsd` and sent nothing. An operator shell-quoting
slip meant the first kill command did not run, so an extra 0.005 SOL went out
on tick-5, under the cap, and settled correctly. That send is an operator
error. Signature
`2xA7RUuUAdQ1kjUwM7p5bVAJn2FNYf2GfdDRzeJ5SSLL7RqN8brhfxXNUNHGyb87RLsKJvJoymHhGJh7tbmAQmUR`.
Then `kill --scope global` engaged, and the next execute got 423
`KillSwitchEngaged`. After an Engine restart on the same data dir, kill-status
was still engaged and the next execute was still 423. After disengage, 0.001
SOL succeeded. Signature
`5k4gHuSBAzjgc8p3KVAKbatqUzmAszbeUA72wtTZG67fXWwdwdPu1dC83fY9nZAkktDPyXZhKTRm2ByqLJyebWjP`.
The next one got 422 on the daily cap.

Strategy B (per tick $2, per day $1.5). `kill -9` ran once the intent row had a
signature (in_flight, hold $1.102). That signature was already confirmed before
the restart finished, so startup recovery settled it once with the original
signature (actual = reserved, one row). The transaction moved 10,000,000
lamports. Signature
`2SLNT6Z3myBKwNc2jTHN8eVMfyUEghHX5u9k9ZSCU8De8ri8KBSwE5eCWC6ubsmeuM97Q4BKMPWWEDTZQpKAx7sw`.
A same-size transfer then got 422 on the daily cap. 0.003 SOL that fit the
remainder succeeded. Signature
`2EP8JEfb8EQcBKXKeuSQXXqS8wFeKnwHLscb7nuTv5CQFGfFhWDEGCX3d2Kh6PhN8HgT5j9FiV1GxcMqwkeCebz4`.
The next 0.003 SOL got 422 with no signature.

Strategy C crashed before signing. The intent was failed with `TransactionFailed`
('nothing was sent') and the hold was released. A same-notional transfer then
succeeded. The transaction moved 10,000,000 lamports. Signature
`49MvFPHfy5pFNSpxvN2vyQ99Csz1EowF71KBRT9FvpzzcuMruCtm6fgnfBK1hQ5MpMNUVB8qWzy8dnjAyqWN7LTQ`.

From before the first send to after the last:

- signer 1.56667593 → 1.50762793 SOL (−0.05904800)
- recipient 0.966812096 → 1.025812096 SOL (+0.059)
- fees 48,000 lamports = 8 sends × 6,000
- no open reservations left

Each confirmed send's signer lamport delta was the transfer plus the 6,000
lamport fee. The eight signatures were matched by prefix with
`getSignaturesForAddress` on the signer, on 2026-10-10, after the #234 sends.
The recipient was read from the account keys.

The blockhash-expiry path is covered on Surfpool only. The in-flight-across-restart
branch landed confirmed before restart, so the unconfirmed-at-restart case is
covered on Surfpool only. Surfpool coverage is not claimed in the feature-map row.

Simulate-first wasn't recorded for those sends. The row can be promoted again
after a funded round that logs the simulate result, compute units, and
`skipSimulation: false` next to each signature.

## Unattended strategy ticks after the STRATEGIES flag (#246)

**Status: one unattended funded round is recorded.** Kernel ran it on
2026-10-13 (UTC+7) at commit `6b64c81edf01e4d469aa26073bc33cc2c9e82299`, the
merge commit for #246. The signer is QA wallet `DfWpQReR…`. The run was from
Kernel's computer. The strategy ended `done`.

Every send was simulated first with `skipSimulation:false`. Simulation results
and compute units were captured by an RPC logging proxy outside the repo. The
hold is input × 1.01 + 105,000 lamports (5k base fee plus 100k priority). On
each landed tick, settled equaled input plus meta.fee and was no more than the
hold. `err` was null.

Tick 1. Hold 1.022508, settled 1.012495. Simulation compute units 142,419,
chain compute units 142,459, fee 105,000 lamports. Signature
`3rU9dMAKfr5xsQ6yQ8WQQPc5w4V545KzcnQEcbw1n4gZDQGbzwva3L2BJdeoj1jb3Ux8br7NGzKjJzpc3S5k1kt3`.

Tick 2. Hold 1.021312, settled 1.011311. Simulation compute units 157,035,
chain compute units 157,035, fee 105,000 lamports. Signature
`4iv31MvGYbix3sD5f1c2jTzkEi3wjU7rJMvom4DuX23qFahMqPuLi92hJirgpAYymRV2yZG6FyBiuqpRbu7nLNeo`.

Tick 3 was the kill switch, engaged. Recorded as `skipped_bounds`, with no
simulation, no send, and balances unchanged.

Tick 4. Hold 1.023548, settled 1.013525. Simulation compute units 251,170,
chain compute units 252,326, fee 105,000 lamports. Signature
`5K62PRw3BxSYg7m1YdD6KgvjitvD7eVZpYYxZs9xpGA4Va4YJYJ4NmtQA37WAsuPzAPVt2SrfhJfD9JuKe8ijuEA`.

Tick 5. Hold 1.021995, settled 1.011987. Simulation compute units 194,877,
chain compute units 194,106, fee 105,000 lamports. Signature
`2h5nGESZFZq6AsC7LnkyzZFKpbqgr5KHgLzDoVzcua9L1dnRin4urLNfYHvH7HNeLdnUrApW5HA9hvAdWGrHt8vq`.

The swap-back moved 4.004195 USDC to SOL. Simulation compute units 29,166.
Signature
`67EnBQfoSW25etX7fJgBafQiyr3CPgFMF6HzzNFu1WDTvT27fBA6iq7uc87cZrDWak1YVERmDTn3MJ5kzkGS2yfs`.

The USDC account closed in
`53UNw1rWFrEFV7wRp9S5rDx8QS8sD2mZ5PEyiK7ayVQJUt1cfZPDbV97uCDHzES5c4FQD71rtx5NqzhuVgrY2auk`.

SOL went 910,971,092 → 910,398,143, a net cost of 572,949 lamports (531,000
fees, 41,949 spread). The wallet was all SOL.

The 423 path can't be reached for swaps. The clock tick isn't an HTTP call,
and `/v1/actions/execute` returns 400 for swaps. Only `transfer_sol` reserves
against a strategy cap, so the 423 check wasn't exercised.

A refused tick doesn't consume a slot. Four ticks executed across five clock
ticks.

Disengaging the kill switch resumed ticks normally. Tick 4 ran after the
disengage.
