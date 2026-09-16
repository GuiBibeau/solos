// @ts-check
/** @typedef {import("./profile.js").Profile} Profile */
/** @typedef {import("./profile.js").ProviderName} ProviderName */
/** @typedef {import("./profile.js").CredentialsFile} CredentialsFile */
/** @typedef {import("./resolve.js").SignerSource} SignerSource */
/** @typedef {import("./discover.js").DiscoveredWallet} DiscoveredWallet */
export {
  discoverLocalWallets,
  discoverPayAccounts,
  discoverSolanaCliKeypairs,
  parsePayAccounts,
} from "./discover.js";
export { configDir, credentialsPath } from "./paths.js";
export {
  CredentialsFileSchema,
  LocalProfileSchema,
  PROVIDERS,
  PayProfileSchema,
  PrivyProfileSchema,
  PrivyServerProfileSchema,
  ProfileSchema,
} from "./profile.js";
export { selectProfile, sourceFromProfile } from "./resolve.js";
export { isSecretRef, resolveSecretRef } from "./secret-ref.js";
export {
  readCredentials,
  removeProfile,
  saveProfile,
  setDefaultProfile,
  writeCredentials,
} from "./store.js";
