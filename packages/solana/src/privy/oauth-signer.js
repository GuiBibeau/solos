// @ts-check
import {
  address,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { ensureFreshSession } from "./session.js";

/**
 * @typedef {{
 *   api: import("./api.js").PrivyApi;
 *   walletId: string;
 *   walletAddress: string;
 *   session: import("./session.js").PrivySession;
 *   persist: (session: import("./session.js").PrivySession) => void | Promise<void>;
 * }} PrivySignerInput
 */

/**
 * Ask Privy to sign one serialized transaction. A 401 means the grant expired: refresh and retry once.
 * @param {PrivySignerInput} deps
 * @param {{ current: import("./session.js").PrivySession }} state mutable session holder
 * @param {string} wire base64 serialized transaction
 * @returns {Promise<string>} base64 signed transaction
 */
const signWire = async (deps, state, wire) => {
  const { api, walletId, persist } = deps;
  state.current = await ensureFreshSession({ api, session: state.current, persist });
  const body = { method: "signTransaction", params: { transaction: wire, encoding: "base64" } };
  const call = () =>
    api.walletRpc({
      walletId,
      body,
      accessToken: state.current.accessToken,
      authorizationKey: state.current.authorizationKey,
    });
  let response = await call();
  if (response.status === 401) {
    state.current = await ensureFreshSession({ api, session: state.current, persist, force: true });
    response = await call();
  }
  if (!response.ok) {
    throw new Error(
      `privy signTransaction failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  const data = /** @type {{ data: { signed_transaction: string } }} */ (await response.json());
  return data.data.signed_transaction;
};

/**
 * A Kit `TransactionPartialSigner` backed by a user's Privy embedded wallet through the agent
 * OAuth grant. Privy signs the serialized transaction; we lift our signature out of the result so
 * Kit can merge it with any other signers.
 * @param {PrivySignerInput} input
 * @returns {import("@solana/kit").TransactionPartialSigner}
 */
export const createPrivyOAuthSigner = (input) => {
  const owner = address(input.walletAddress);
  const state = { current: input.session };
  const base64 = getBase64Encoder();
  const decoder = getTransactionDecoder();
  return {
    address: owner,
    signTransactions: async (transactions) =>
      Promise.all(
        transactions.map(async (transaction) => {
          const wire = getBase64EncodedWireTransaction(transaction);
          const signed = decoder.decode(base64.encode(await signWire(input, state, wire)));
          const signature = signed.signatures[owner];
          if (!signature) throw new Error(`privy returned no signature for ${owner}`);
          return Object.freeze({ [owner]: signature });
        }),
      ),
  };
};
