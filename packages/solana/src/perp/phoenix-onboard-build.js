// @ts-check
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected, BuildUnavailable } from "@solos/core";
import { Effect } from "effect";
import { assertV1MessageForSigning, beginV1Message } from "../executor/transaction-v1.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { traderAddress } from "./perp-onboarder-live.js";
import { RegisterBuild, phoenixPost } from "./phoenix-onboard-api.js";
import { assertEnrollmentBuild } from "./phoenix-onboard-guards.js";

const CONFIG = Object.freeze({
  computeUnitLimit: 500_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: 0n,
});

/** @param {{pubkey:string,isSigner:boolean,isWritable:boolean}} key */
const role = (key) => {
  if (key.isSigner)
    return key.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
};

/** @param {import("zod").infer<typeof RegisterBuild>["instructions"][number]} ix */
const instructionOf = (ix) => ({
  programAddress: address(ix.programId),
  accounts: ix.keys.map((key) => ({ address: address(key.pubkey), role: role(key) })),
  data: Uint8Array.from(ix.data),
});

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {string} owner @param {string} trader */
const fetchBuild = (config, owner, trader) =>
  Effect.gen(function* () {
    const build = yield* Effect.tryPromise({
      try: async () =>
        RegisterBuild.parse(
          await phoenixPost(config, "/v1/exchange/build-register-ixs", {
            traderAuthority: owner,
            txFeePayer: owner,
            maxPositions: 128,
          }),
        ),
      catch: () =>
        new BuildUnavailable({
          reason:
            "Phoenix onboarding is unavailable or denied; verify PHOENIX_BASE_URL and request Phoenix trader access",
        }),
    });
    return yield* Effect.try({
      try: () => assertEnrollmentBuild(build, owner, trader),
      catch: () =>
        new BuildRejected({
          reason: "Phoenix enrollment instructions failed validation; nothing was signed",
        }),
    });
  });

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {import("../rpc/solana-rpc.js").SolanaRpcShape} ctx @param {import("../signer/kit-signer.js").KitSignerShape} kit */
export const buildOnboarding = (config, ctx, kit) =>
  Effect.gen(function* () {
    const owner = kit.signer.address;
    const trader = yield* Effect.tryPromise({
      try: () => traderAddress(owner),
      catch: () => new BuildRejected({ reason: "invalid configured Phoenix owner" }),
    });
    const build = yield* fetchBuild(config, owner, trader);
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = yield* Effect.try({
      try: () =>
        pipe(
          beginV1Message({ feePayerSigner: kit.signer, config: CONFIG }),
          (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
          (m) => appendTransactionMessageInstructions(build.instructions.map(instructionOf), m),
        ),
      catch: () =>
        new BuildRejected({ reason: "Phoenix enrollment instructions could not be encoded" }),
    });
    const signed = yield* Effect.tryPromise({
      try: () => {
        assertV1MessageForSigning(message);
        return partiallySignTransactionMessageWithSigners(message);
      },
      catch: () =>
        new BuildRejected({
          reason: "Phoenix enrollment failed v1 signing policy; nothing was sent",
        }),
    });
    const wire = yield* Effect.try({
      try: () => getBase64EncodedWireTransaction(signed),
      catch: () => new BuildRejected({ reason: "Phoenix enrollment wire encoding failed" }),
    });
    return { signed, wire, owner, trader };
  });
