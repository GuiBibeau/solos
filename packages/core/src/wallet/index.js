// @ts-check
/** @typedef {import("./domain/types.js").TokenBalance} TokenBalance */
/** @typedef {import("./domain/types.js").WalletBalances} WalletBalances */
/** @typedef {import("./ports/balance-reader.js").BalanceReaderShape} BalanceReaderShape */
/** @typedef {import("./ports/signer.js").SignerShape} SignerShape */
export { TokenBalanceSchema, WalletBalancesSchema } from "./domain/types.js";
export { BalanceReader } from "./ports/balance-reader.js";
export { Signer } from "./ports/signer.js";
export { getAddressTool } from "./tools/get-address.js";
export { getBalanceTool } from "./tools/get-balance.js";
export { getAddress } from "./use-cases/get-address.js";
export { getBalances } from "./use-cases/get-balances.js";

import { getAddressTool } from "./tools/get-address.js";
import { getBalanceTool } from "./tools/get-balance.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const walletTools = [getAddressTool, getBalanceTool];
