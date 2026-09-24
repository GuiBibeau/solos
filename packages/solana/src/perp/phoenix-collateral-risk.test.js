// @ts-check
import { expect, test } from "bun:test";
import { validateWithdrawalState } from "./phoenix-collateral-risk.js";
import { DEFAULT_AUTHORITY, flatState, longState, subaccount } from "./phoenix-scenarios.js";

const facts = { owner: DEFAULT_AUTHORITY, currentSlot: 448_348_464, withdrawQueueNode: null };
/** @param {ReturnType<typeof flatState>} state */
const permitted = (state) => {
  state.snapshot.capabilities.capabilities = { withdrawCollateral: { immediate: true } };
  return state;
};

test("withdrawal risk accepts a fresh complete all-market flat snapshot", () => {
  expect(validateWithdrawalState(permitted(flatState()), facts)).toBe("250000000");
});

test("withdrawal risk refuses missing or disabled withdrawal capability", () => {
  expect(() => validateWithdrawalState(flatState(), facts)).toThrow();
  const state = permitted(flatState());
  state.snapshot.capabilities.capabilities = { withdrawCollateral: { immediate: false } };
  expect(() => validateWithdrawalState(state, facts)).toThrow();
});

test("withdrawal risk refuses exposure even when the requested market is flat", () => {
  expect(() => validateWithdrawalState(permitted(longState()), facts)).toThrow();
});

test("withdrawal risk rejects zero-lot positions with unsettled quote exposure", () => {
  const state = permitted(longState());
  const position = state.snapshot.subaccounts[0]?.positions[0];
  if (position === undefined) throw new Error("fixture missing position");
  position.basePositionLots = "0";
  position.virtualQuotePositionLots = "1";
  expect(() => validateWithdrawalState(state, facts)).toThrow();
});

test("withdrawal risk rejects missing order and settlement fields", () => {
  const state = permitted(flatState());
  const sub = state.snapshot.subaccounts[0];
  if (sub === undefined) throw new Error("fixture missing subaccount");
  Reflect.deleteProperty(sub, "orders");
  expect(() => validateWithdrawalState(state, facts)).toThrow();
});

test("withdrawal risk rejects an unknown queue status and pending withdrawal", () => {
  const state = permitted(flatState());
  expect(() =>
    validateWithdrawalState(state, { ...facts, withdrawQueueNode: undefined }),
  ).toThrow();
  expect(() => validateWithdrawalState(state, { ...facts, withdrawQueueNode: 2 })).toThrow();
});

test("withdrawal risk rejects snapshots older than the allowed slot window", () => {
  expect(() =>
    validateWithdrawalState(permitted(flatState()), {
      ...facts,
      currentSlot: facts.currentSlot + 13,
    }),
  ).toThrow();
});

test("withdrawal risk considers every subaccount and unknown resting orders", () => {
  const state = permitted(flatState());
  state.snapshot.subaccounts.push(
    subaccount(1, { positions: longState().snapshot.subaccounts[0]?.positions }),
  );
  expect(() => validateWithdrawalState(state, facts)).toThrow();
  const flat = permitted(flatState());
  const zero = flat.snapshot.subaccounts[0];
  if (zero === undefined) throw new Error("fixture missing subaccount");
  zero.orders.push({ symbol: "ETH", orders: [{}] });
  expect(() => validateWithdrawalState(flat, facts)).toThrow();
});
