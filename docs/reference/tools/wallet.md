# Wallet

Part of the [tool reference](index.md).

## Balance and address

`solana_wallet_get_balance` and `solos wallet balance [--owner <address>]` read SOL and every
Token and Token-2022 balance of one wallet, the configured signer's by default. Each token row
names its `tokenAccount`, the address the close tools below take.

`solana_wallet_get_address` and `solos wallet address` report the configured signer's address
and backend.

## Closing a token account

`solana_wallet_simulate_close_token_account` / `solana_wallet_execute_close_token_account`, and
`solos wallet simulate-close-account --account <address>` / `close-account`, close one token
account the signer owns. Every lamport it holds returns to the signer:

- **An empty account** returns its rent.
- **The wrapped-SOL account** returns its rent and unwraps its whole wSOL balance to native SOL.
  This is the exit for wSOL that a liquidity withdrawal leaves in the wallet. It also clears the
  way for native-SOL swaps, which refuse to run while a funded wSOL account exists.

The executor reads the account on chain, then refuses before signing when:

- it is not a Token or Token-2022 token account
- the signer does not own it
- it is frozen or uninitialized
- another account holds its close authority
- it is not wrapped SOL and still holds a balance (the remedy says to move that balance first)

The token program is the account's on-chain owner, never assumed.

The simulation quote (`token_account_close`) names the account, its mint and token program,
`returnedLamports` and `unwrappedLamports`. The close runs through Submission like every other
send (ADR-0031): simulate first, lifetime rechecked, sent once, confirmed.
