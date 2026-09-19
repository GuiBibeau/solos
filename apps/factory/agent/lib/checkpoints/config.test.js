// @ts-check
import { expect, test } from "bun:test";
import { checkpointKey } from "./config.js";

test("checkpoint keys are stable and isolated by work item and station", () => {
  const first = checkpointKey("GuiBibeau/solos#18", "root-one", "implementer");
  expect(first).toBe(checkpointKey("GuiBibeau/solos#18", "root-one", "implementer"));
  expect(first).not.toBe(checkpointKey("GuiBibeau/solos#18", "root-one", "reviewer"));
  expect(first).not.toBe(checkpointKey("GuiBibeau/solos#18", "root-two", "implementer"));
  expect(first).not.toBe(checkpointKey("GuiBibeau/solos#19", "root-one", "implementer"));
  expect(first).toStartWith("station-checkpoints/");
});

test("checkpoint keys reject path traversal and unknown stations", () => {
  expect(checkpointKey("../factory-brain/secret", "root-one", "implementer")).toBeNull();
  expect(checkpointKey("GuiBibeau/solos#18", "../root", "implementer")).toBeNull();
  expect(checkpointKey("GuiBibeau/solos#18", "root-one", "unknown")).toBeNull();
});
