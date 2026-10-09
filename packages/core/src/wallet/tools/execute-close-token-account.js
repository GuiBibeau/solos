// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { CloseTokenAccountExecuteInputSchema } from "../domain/types.js";
import { executeCloseTokenAccount } from "../use-cases/close-token-account.js";

export const executeCloseTokenAccountTool = defineTool({
  name: "solana_wallet_execute_close_token_account",
  group: "wallet",
  tier: "execute",
  stability: "stable",
  action: "close_token_account",
  title: "Close a token account",
  description:
    "Close one of the wallet's token accounts and wait for confirmation: reclaim the rent of " +
    "an empty account, or unwrap wrapped SOL (wSOL) back into native SOL. Signs and submits a " +
    "real transaction. account is the token account address, as solana_wallet_get_balance " +
    "lists it. It must be a Token or Token-2022 account the configured signer owns, not " +
    "frozen, with no other close authority, and empty unless it is the wrapped-SOL account, " +
    "whose whole balance returns as native SOL. Every lamport it holds goes to the signer. " +
    "Simulates the exact transaction first and sends nothing when validation, simulation or " +
    "the blockhash lifetime fails; skipSimulation bypasses only the simulation. Never " +
    "re-sends after an ambiguous submission; the signature is reported in the structured " +
    "failure. Use solana_wallet_simulate_close_token_account to preview.",
  input: CloseTokenAccountExecuteInputSchema,
  run: (input) => executeCloseTokenAccount(input),
});
