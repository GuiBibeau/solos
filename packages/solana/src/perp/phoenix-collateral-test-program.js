// @ts-check
import { decodeTokenAccount, decodeTrader, SPL_TOKEN_PROGRAM_ADDRESS } from "@ellipsis-labs/rise";
import {
  getBase16Decoder,
  getBase58Decoder,
  getBase64Codec,
  getTransactionDecoder,
} from "@solana/kit";
import { jsonRpc } from "../surfnet/index.js";

/** @param {string} url @param {string} key */
const accountOf = async (url, key) => {
  const { value } = await jsonRpc(url, "getAccountInfo", [key, { encoding: "base64" }]);
  if (!value) throw new Error("offline fixture account is absent");
  return value;
};

/** @param {{data:readonly [string,string]}} row */
const bytesOf = (row) => Uint8Array.from(Buffer.from(row.data[0], "base64"));
/** @param {Record<string, any>} row @param {Uint8Array} bytes */
const withBytes = (row, bytes) => ({
  ...row,
  data: [Buffer.from(bytes).toString("base64"), "base64"],
});

/** @param {string} rpcUrl @param {string} key @param {{row:any; bytes:Uint8Array}} account */
const apply = (rpcUrl, key, { row, bytes }) =>
  jsonRpc(rpcUrl, "surfnet_setAccount", [
    key,
    {
      owner: row.owner,
      lamports: row.lamports,
      data: getBase16Decoder().decode(bytes),
      executable: false,
    },
  ]);

/** @typedef {{owner:string;trader:string;atas:{usdc:string};collateral:bigint;walletUsdc:bigint}} Scenario */
/** @param {string} rpcUrl @param {Scenario} scenario @param {"deposit" | "deposit_mismatch" | "withdraw" | "withdraw_full" | "withdraw_partial"} direction */
const postBalances = async (rpcUrl, scenario, direction) => {
  const [payer, wallet, trader] = await Promise.all([
    accountOf(rpcUrl, scenario.owner),
    accountOf(rpcUrl, scenario.atas.usdc),
    accountOf(rpcUrl, scenario.trader),
  ]);
  if (wallet.owner !== SPL_TOKEN_PROGRAM_ADDRESS) throw new Error("wallet ATA not classic");
  const walletBytes = bytesOf(wallet);
  const traderBytes = bytesOf(trader);
  const input = direction === "withdraw_full" ? 2_000_000n : 1_000_000n;
  const isDeposit = direction.startsWith("deposit");
  const walletAfter = scenario.walletUsdc + (isDeposit ? -input : input);
  const traderDebit = direction === "withdraw_partial" ? 500_000n : input;
  const traderAfter = isDeposit ? scenario.collateral + input : scenario.collateral - traderDebit;
  new DataView(walletBytes.buffer).setBigUint64(64, walletAfter, true);
  new DataView(traderBytes.buffer).setBigInt64(88, traderAfter, true);
  if (
    decodeTokenAccount(walletBytes).amount !== walletAfter ||
    decodeTrader(traderBytes).state.quoteLotCollateral !== traderAfter
  )
    throw new Error("synthetic program credit failed codec validation");
  const postAccounts = [
    { ...payer, lamports: payer.lamports - 5000 },
    withBytes(wallet, walletBytes),
    withBytes(trader, traderBytes),
  ];
  return { postAccounts, wallet, trader, walletBytes, traderBytes };
};

/** Scripted on-chain program response over a forwarding Surfpool RPC proxy. The production
 * adapter still builds, signs, preflights and reconciles real wallet/trader account layouts;
 * only the missing offline Phoenix executable's simulation and send are replaced.
 * @param {string} rpcUrl @param {Scenario} scenario @param {"deposit" | "deposit_mismatch" | "withdraw" | "withdraw_full" | "withdraw_partial"} direction */
export const scriptedPhoenixProgram = async (rpcUrl, scenario, direction) => {
  const { postAccounts, wallet, trader, walletBytes, traderBytes } = await postBalances(
    rpcUrl,
    scenario,
    direction,
  );
  let sends = 0;
  return {
    get sends() {
      return sends;
    },
    overrides: {
      simulateTransaction: () => ({
        value: { err: null, logs: [], unitsConsumed: 28_426, accounts: postAccounts },
      }),
      sendTransaction: async (/** @type {unknown[]} */ params) => {
        sends += 1;
        const [wire] = params;
        if (typeof wire !== "string") throw new Error("missing signed wire");
        if (direction === "deposit_mismatch")
          new DataView(walletBytes.buffer).setBigUint64(64, scenario.walletUsdc - 1_000_001n, true);
        await Promise.all([
          apply(rpcUrl, scenario.atas.usdc, { row: wallet, bytes: walletBytes }),
          apply(rpcUrl, scenario.trader, { row: trader, bytes: traderBytes }),
        ]);
        const signature = Object.values(
          getTransactionDecoder().decode(getBase64Codec().encode(wire)).signatures,
        )[0];
        if (!signature) throw new Error("signed wire has no signature");
        return getBase58Decoder().decode(signature);
      },
      getSignatureStatuses: () => ({ value: [{ confirmationStatus: "confirmed", err: null }] }),
    },
  };
};
