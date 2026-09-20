// @ts-check
import { test } from "bun:test";
import {
  createOwnershipHarness,
  verifyOwnershipTransfer,
  verifyUnboundWritesFailClosed,
} from "./checkpoint-ownership-fixture.js";

test("real dispatch tools transfer reused-session checkpoint ownership", async () => {
  const harness = createOwnershipHarness();
  await verifyUnboundWritesFailClosed(harness);
  await verifyOwnershipTransfer(harness);
});
