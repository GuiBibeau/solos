// @ts-check
/** @typedef {import("./api.js").PrivyApi} PrivyApi */
/** @typedef {import("./api.js").PrivyWallet} PrivyWallet */
/** @typedef {import("./api.js").DeviceAuthorization} DeviceAuthorization */
/** @typedef {import("./session.js").PrivySession} PrivySession */
export { PrivyApiError, privyApi } from "./api.js";
export { DEFAULT_PRIVY_APP_ID, privyConfig } from "./config.js";
export { createPrivyOAuthSigner } from "./oauth-signer.js";
export {
  PrivySessionSchema,
  ensureFreshSession,
  isSessionFresh,
  sessionFromTokens,
} from "./session.js";
