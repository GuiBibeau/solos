// @ts-check
import { Effect } from "effect";
import { CapLedger } from "../ports/cap-ledger.js";

/** @param {string} scope @param {string} reason */
export const engageKillSwitch = (scope, reason) =>
  Effect.flatMap(CapLedger, (ledger) =>
    ledger.engage({ scope, reason }).pipe(Effect.as({ scope, engaged: true, reason })),
  ).pipe(Effect.withSpan("strategy.engageKill"));

/** @param {string} scope */
export const disengageKillSwitch = (scope) =>
  Effect.flatMap(CapLedger, (ledger) =>
    ledger.disengage(scope).pipe(Effect.as({ scope, engaged: false, reason: null })),
  ).pipe(Effect.withSpan("strategy.disengageKill"));

/** @param {string} scope */
export const killSwitchStatus = (scope) =>
  Effect.flatMap(CapLedger, (ledger) =>
    ledger.status(scope).pipe(Effect.map((status) => ({ scope, ...status }))),
  ).pipe(Effect.withSpan("strategy.killStatus"));

/**
 * The switch as it stands, and the reason that would be stored. Applies nothing.
 * @param {string} scope
 * @param {string} reason
 */
export const previewEngageKill = (scope, reason) =>
  Effect.flatMap(CapLedger, (ledger) =>
    ledger
      .status(scope)
      .pipe(Effect.map((status) => ({ scope, reason, engaged: status.engaged, apply: false }))),
  ).pipe(Effect.withSpan("strategy.simulateEngageKill"));

/**
 * The switch as it stands. Applies nothing.
 * @param {string} scope
 */
export const previewDisengageKill = (scope) =>
  Effect.flatMap(CapLedger, (ledger) =>
    ledger.status(scope).pipe(Effect.map((status) => ({ scope, ...status, apply: false }))),
  ).pipe(Effect.withSpan("strategy.simulateDisengageKill"));
