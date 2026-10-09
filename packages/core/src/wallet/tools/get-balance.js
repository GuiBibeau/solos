// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { defineTool } from "../../shared/tools/define-tool.js";
import { getBalances } from "../use-cases/get-balances.js";

export const getBalanceTool = defineTool({
  name: "solana_wallet_get_balance",
  group: "wallet",
  tier: "read",
  stability: "beta",
  title: "Get wallet balance",
  description:
    "Get the SOL balance and all SPL token balances (Token and Token-2022) of a Solana wallet. " +
    "Defaults to the configured signer's wallet when no owner is given. Use to check funds, holdings, or portfolio.",
  input: z.object({
    owner: AddressSchema.optional().describe(
      "Wallet address to inspect. Omit to use the configured signer's address.",
    ),
  }),
  run: ({ owner }) => getBalances(owner),
});
