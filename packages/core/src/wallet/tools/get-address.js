// @ts-check
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import { getAddress } from "../use-cases/get-address.js";

export const getAddressTool = defineTool({
  name: "solana_wallet_get_address",
  group: "wallet",
  tier: "read",
  stability: "beta",
  title: "Get signer address",
  description:
    "Get the public address and backend type of the wallet this server signs with. " +
    "Use to know which account will pay fees and send funds before transferring or swapping.",
  input: z.object({}),
  run: () => getAddress(),
});
