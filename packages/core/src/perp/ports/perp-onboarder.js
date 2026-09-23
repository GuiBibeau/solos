// @ts-check
import { Context } from "effect";

/** @typedef {{ readonly state: "unregistered" | "partial" | "ready"; readonly trader: string | null }} OnboardingStatus */
/** @typedef {{ readonly status: (owner: string) => import("effect").Effect.Effect<OnboardingStatus, import("../domain/errors.js").PerpError> }} PerpOnboarderShape */

export const PerpOnboarder = /** @type {Context.Tag<PerpOnboarderShape, PerpOnboarderShape>} */ (
  Context.GenericTag("@solos/perp/PerpOnboarder")
);
