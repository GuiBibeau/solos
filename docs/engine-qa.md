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

## Durable cap ledger and kill switch (#195)

**Status: one funded mainnet round is recorded.** Kernel ran it from Gui's Mac
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
