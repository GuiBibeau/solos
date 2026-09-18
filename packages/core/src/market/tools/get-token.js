// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetTokenInputSchema } from "../domain/types.js";
import { getToken } from "../use-cases/get-token.js";

export const getTokenTool = defineTool({
  name: "solana_market_get_token",
  group: "market",
  tier: "read",
  title: "Get token metadata",
  description:
    "Read verified on-chain metadata for one token mint: name, symbol, decimals, and logoUri. " +
    "Covers standard SPL mints with Metaplex metadata and Token-2022 mints with metadata " +
    "extensions or a metadata pointer. An address that does not exist or is not a mint account " +
    "fails UnknownToken; a valid mint whose metadata is absent or unreadable fails " +
    "TokenMetadataUnavailable, so the ticker is never invented. Wrapped SOL and USDC fall back " +
    "to their canonical names only after the mint account, owner, and decimals were verified on " +
    "chain. logoUri is null unless a real logo URI lives on chain; the metadata JSON uri is not " +
    "a logo and no off-chain URL is ever fetched.",
  input: GetTokenInputSchema,
  run: getToken,
});
