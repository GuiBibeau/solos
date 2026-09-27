// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { CloseTokenAccountInputSchema } from "../domain/types.js";
import { simulateCloseTokenAccount } from "../use-cases/close-token-account.js";

export const simulateCloseTokenAccountTool = defineTool({
  name: "solana_wallet_simulate_close_token_account",
  group: "wallet",
  tier: "simulate",
  title: "Simulate closing a token account",
  description:
    "Preview closing one of the wallet's token accounts to get its rent back, or to unwrap " +
    "wrapped SOL (wSOL) into native SOL, without sending anything. account is the token " +
    "account address, as solana_wallet_get_balance lists it. The executor reads the account " +
    "on chain: it must be a Token or Token-2022 account the configured signer owns, not " +
    "frozen, with no other close authority, and empty unless it is the wrapped-SOL account, " +
    "whose whole balance is unwrapped. Reports the mint, the token program, the lamports the " +
    "close returns and the lamports unwrapped, and simulates exactly the transaction it would " +
    "send. Anything it may not close is refused before building. Use " +
    "solana_wallet_execute_close_token_account to send.",
  input: CloseTokenAccountInputSchema,
  run: (input) => simulateCloseTokenAccount(input),
});
