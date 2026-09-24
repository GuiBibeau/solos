// @ts-check
import { expect, test } from "bun:test";
import { perpTools } from "../index.js";

const names = [
  "solana_perp_simulate_deposit_collateral",
  "solana_perp_execute_deposit_collateral",
  "solana_perp_simulate_withdraw_collateral",
  "solana_perp_execute_withdraw_collateral",
];

test("Phoenix collateral tools expose explicit simulate and execute twins without destinations", () => {
  for (const name of names) {
    const tool = perpTools.find((entry) => entry.name === name);
    expect(tool?.name).toBe(name);
    expect(tool?.input.safeParse({ amount: "1000000" }).success).toBe(true);
    for (const amount of ["0", "-1", "1.2", "1e6", "18446744073709551616", 1])
      expect(tool?.input.safeParse({ amount }).success).toBe(false);
    expect(tool?.input.safeParse({ amount: "18446744073709551615" }).success).toBe(true);
    expect(tool?.input.safeParse({ amount: "01" }).success).toBe(true); // Existing base-unit grammar permits padding.
    expect(tool?.input.safeParse({ amount: "1000000", destination: "evil" }).success).toBe(false);
  }
});
