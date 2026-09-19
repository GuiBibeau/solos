// @ts-check
import { replayContract, replayRow } from "./replay-builder.js";

const criteria = [
  "Give every test call that can resolve profiles a test-owned temporary configuration directory explicitly. Missing-profile assertions must read a known empty fixture store, not the operator's real store.",
  "Audit reusable test setup and spawned CLI/MCP test environments for the same leak. Use disposable local fixture profiles/signers and loopback RPCs; no access to real Keychain, wallet files, provider keys or mainnet.",
  "Preserve production precedence: explicit SOLOS_SIGNER_* inputs, then named SOLOS_PROFILE, then default profile; preserve explicit SOLANA_RPC_URL precedence and no public fallback. Do not disable profiles in production to make tests pass.",
  "Do not move, rename, modify, delete or require access to the operator's credentials. No runtime HOME/config tricks and no weakening the failing assertion.",
  "Keep the patch focused on verification isolation. Existing profile selection and CLI/MCP behavior must remain covered.",
  "Regression exercises the absent-profile assertion using a fresh empty store, plus a separate fixture store with a disposable configured default, so behavior does not depend on the machine's login state.",
  "Regression covers explicit env precedence and named/default profile selection using fixture data; existing integration tests remain green.",
  "Clean committed `bun run solos dev verify --scope unit --json` Evidence matches the PR head. Full offline verification and CI must pass.",
  "Operator QA will rerun full native verification while the real default wallet remains configured, verify the credential file is unchanged, and confirm no real signer/provider was accessed. Factory reports this operator check as pending, not passed.",
];

/** @type {{number: number, criteria: string[], boundaries: import("./replay-builder.js").Boundary[]}} */
const contract = {
  number: 46,
  criteria,
  boundaries: [
    {
      criterion: 1,
      id: "fresh-env",
      validator: "integration",
      requirement:
        "All fresh env objects include the test-owned config directory; setup/store/cleanup is integration I/O.",
      surfaces: [
        "env.test:missing-rpc",
        "env.test:no-signer",
        "env.test:two-signers",
        "env.test:ephemeral",
        "env.test:keypair",
        "env.test:private-key",
      ],
    },
    {
      criterion: 2,
      id: "children",
      validator: "integration",
      requirement:
        "Every child CLI/MCP environment explicitly isolates config, local signer fixtures and loopback RPC.",
      surfaces: ["child.cli", "child.mcp"],
    },
    {
      criterion: 3,
      id: "precedence",
      validator: "integration",
      requirement:
        "Explicit signer/RPC overrides named profile then default; no implicit public RPC.",
      surfaces: [
        "env-profile:explicit-signer",
        "env-profile:explicit-rpc",
        "env-profile:named",
        "env-profile:default",
      ],
    },
    {
      criterion: 4,
      id: "cleanup",
      validator: "integration",
      responsibility: "standards",
      requirement:
        "Only owned temporary stores are removed; no operator credential access or HOME mutation.",
      surfaces: ["env.test:cleanup", "env-profile.test:cleanup"],
    },
    {
      criterion: 5,
      id: "production",
      validator: "review",
      requirement:
        "Tests-only diff preserves production profile resolution and native CLI/MCP behavior.",
      surfaces: ["diff.production"],
    },
    {
      criterion: 5,
      id: "pure-url",
      validator: "pure",
      requirement: "Pure URL parsing stays unit and contains no fixture/store lifecycle I/O.",
      surfaces: ["env-url.test:parse"],
    },
    {
      criterion: 6,
      id: "stores",
      validator: "integration",
      requirement:
        "Distinct empty/default fixture stores make the absent-profile assertion independent of operator login.",
      surfaces: ["env.test:empty-store", "env-profile.test:default-store"],
    },
    {
      criterion: 7,
      id: "adapters",
      validator: "integration",
      requirement:
        "Real default/named/explicit signer adapters round trip offline Surfpool balances.",
      surfaces: ["surfpool.default", "surfpool.named", "surfpool.explicit"],
    },
    {
      criterion: 8,
      id: "evidence",
      validator: "review",
      requirement: "Clean exact-head unit Evidence, full offline verification and CI pass.",
      surfaces: ["evidence"],
    },
    {
      criterion: 8,
      id: "ci",
      validator: "review",
      responsibility: "ci",
      requirement: "Required full offline CI runs after draft PR creation.",
      surfaces: ["ci.full"],
    },
    {
      criterion: 9,
      id: "operator",
      validator: "native_cli",
      responsibility: "operator",
      requirement:
        "Maintainer must verify native full with real default configured and unchanged credentials.",
      surfaces: ["operator.native"],
    },
  ],
};

export const profileReplay = () => {
  const input = replayContract(contract);
  Object.assign(replayRow(input, "operator"), {
    state: "pending",
    reason: "Operator native verification is outside factory; no credentials requested",
    proofs: [],
  });
  input.matrix.summary.pass -= 1;
  input.matrix.summary.pending = 1;
  return input;
};
