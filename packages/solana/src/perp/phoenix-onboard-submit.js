// @ts-check
import { TransactionFailed } from "@solos/core";
import { ZodError } from "zod";
import { MAY_HAVE_LANDED } from "../executor/transfer-confirm.js";
import { PhoenixOnboardHttpError, RegisterSent, phoenixPost } from "./phoenix-onboard-api.js";

/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-onboard-build.js").buildOnboarding>>} Plan */
/** @param {import("zod").infer<typeof RegisterSent>} response @param {Plan} planned @param {import("@solana/kit").Signature} signature */
const isMatchingPlan = (response, planned, signature) =>
  [
    response.signature === signature,
    response.traderPda === planned.trader,
    response.traderOnboarder === planned.onboarder,
    response.txFeePayer === planned.owner,
    response.maxPositions === 128,
    response.includeRegisterTrader === planned.registered,
  ].every(Boolean);

/** @param {import("./phoenix-api.js").PhoenixConfig} config @param {Plan} planned @param {import("@solana/kit").Signature} signature */
export const submitEnrollment = async (config, planned, signature) => {
  let response;
  try {
    response = RegisterSent.parse(
      await phoenixPost(config, "/v1/exchange/send-register-ixs", {
        transaction: planned.wire,
        traderAuthority: planned.owner,
        txFeePayer: planned.owner,
        maxPositions: 128,
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
      }),
    );
  } catch (error) {
    if (error instanceof PhoenixOnboardHttpError)
      throw new TransactionFailed({
        signature,
        reason: `${MAY_HAVE_LANDED}; Phoenix refused submission (HTTP ${error.status})`,
      });
    if (error instanceof ZodError)
      throw new TransactionFailed({
        signature,
        reason: `${MAY_HAVE_LANDED}; Phoenix returned invalid registration response`,
      });
    throw error;
  }
  if (!isMatchingPlan(response, planned, signature)) {
    throw new TransactionFailed({
      signature,
      reason: `${MAY_HAVE_LANDED}; Phoenix response did not match the signed transaction`,
    });
  }
};
