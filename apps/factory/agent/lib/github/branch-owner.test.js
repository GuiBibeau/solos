// @ts-check
import { describe, expect, test } from "bun:test";
import { authorizeBranchPush, parseRemoteHead } from "./branch-owner.js";

const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);
const remote = (sha = HEAD) => `${sha}\trefs/heads/factory/test\n`;

describe("branch revision ownership", () => {
  test("allows one initial publish only while the remote branch is absent", () => {
    expect(authorizeBranchPush({ remoteOutput: "" })).toEqual({ allowed: true, remoteHead: null });
    expect(authorizeBranchPush({ expectedHead: HEAD, remoteOutput: "" }).allowed).toBe(false);
  });

  test("requires the checkout head for every existing-branch push", () => {
    expect(authorizeBranchPush({ remoteOutput: remote() }).allowed).toBe(false);
    expect(authorizeBranchPush({ expectedHead: HEAD, remoteOutput: remote() })).toEqual({
      allowed: true,
      remoteHead: HEAD,
    });
  });

  test("blocks a stale station and ambiguous remote output", () => {
    expect(authorizeBranchPush({ expectedHead: HEAD, remoteOutput: remote(NEXT) }).allowed).toBe(
      false,
    );
    expect(parseRemoteHead(`${remote()}${remote(NEXT)}`)).toBeUndefined();
    expect(parseRemoteHead("not-a-sha refs/heads/factory/test")).toBeUndefined();
  });
});
