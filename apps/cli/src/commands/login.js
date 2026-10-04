// @ts-check
import { Command, Options } from "@effect/cli";
import { PROVIDERS } from "@solos/solana";
import { Effect, Option } from "effect";
import { exitOnFailure } from "../output.js";
import { resolveRpcUrl } from "./login-common.js";
import { loginLocal, loginPay } from "./login-local.js";
import { loginPrivy } from "./login-privy.js";
import { loginPrivyServer } from "./login-vendors.js";

/**
 * @param {string} name
 * @param {string} description
 */
const opt = (name, description) =>
  Options.text(name).pipe(Options.optional, Options.withDescription(description));

const provider = Options.choice("provider", [...PROVIDERS]).pipe(
  Options.withDescription(
    "privy (browser login) · local keypair file · pay account · privy-server (operators, app secret)",
  ),
);
const profile = opt("profile", "Profile name. Defaults to the provider name.");
const setDefault = Options.boolean("default").pipe(
  Options.withDescription("Make this profile the default (the first one always is)"),
);
const rpcUrl = opt("rpc-url", "RPC URL stored with the profile; SOLANA_RPC_URL still wins");
const force = Options.boolean("force").pipe(
  Options.withDescription("privy: log in again even if a valid session exists"),
);

const keypair = opt("keypair", "local: path to a Solana CLI keypair file");
const account = opt("account", "pay: account name from `pay account list`");
const appId = opt("app-id", "privy-server: app id");
const appSecret = opt("app-secret", "privy-server: app secret, or $ENV_VAR / !command");
const walletId = opt("wallet-id", "privy-server: wallet id");
const authorizationKey = opt("authorization-key", "privy-server: P-256 authorization key ref");

/**
 * Bring your own wallet from any supported provider and store it as a named profile that the
 * MCP server and the harness pick up through SOLOS_PROFILE (ADR-0015).
 */
export const login = Command.make(
  "login",
  {
    provider,
    profile,
    setDefault,
    rpcUrl,
    force,
    keypair,
    account,
    appId,
    appSecret,
    walletId,
    authorizationKey,
  },
  (o) => {
    /** @param {import("./login-local.js").Common} common */
    const flow = (common) => {
      switch (o.provider) {
        case "local": {
          return loginLocal(common, o.keypair);
        }
        case "pay": {
          return loginPay(common, o.account);
        }
        case "privy-server": {
          return loginPrivyServer(common, {
            appId: o.appId,
            appSecret: o.appSecret,
            walletId: o.walletId,
            authorizationKey: o.authorizationKey,
          });
        }
        default: {
          return loginPrivy(common, { force: o.force });
        }
      }
    };
    return Effect.gen(function* () {
      const rpcUrl = yield* resolveRpcUrl(o.rpcUrl);
      return yield* flow({
        name: Option.getOrElse(o.profile, () => o.provider),
        setDefault: o.setDefault,
        rpcUrl,
      });
    }).pipe(exitOnFailure);
  },
).pipe(Command.withDescription("Connect a wallet and save it as a profile"));
