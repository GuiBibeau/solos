// @ts-check
import { replayContract } from "./replay-builder.js";

// Issue #47 Acceptance, verbatim. Additional boundaries come from its maintainer corrections.
const criteria = [
  "Zero and sub-lamport-to-zero cases fail for both simulate and execute; one lamport and ordinary positive exact amounts still work.",
  "Boundary tests assert exact parsed amounts and no execution for invalid input. Offline native CLI and stdio MCP tests demonstrate the failure with no usable signer/provider, plus positive behavior against Surfpool.",
  "Existing transfer/wallet behavior and offline integration tests remain green. No mainnet or real operator profile/key is accessed by reusable tests.",
  "Commit first and supply clean matching-head `solos dev verify --scope unit --json` Evidence. Required CI and full offline verification pass before merge.",
  "Operator QA will repeat zero-input rejection through CLI/MCP and verify no transaction was submitted. No live transfer is required to prove rejection; any positive funded smoke test must be separately accounted for by the operator.",
];

/** @type {{number: number, criteria: string[], boundaries: import("./replay-builder.js").Boundary[]}} */
const contract = {
  number: 47,
  criteria,
  boundaries: [
    {
      criterion: 1,
      id: "representations",
      dimension: "representation",
      requirement:
        "Exact integer parsing covers number/string, valid decimals/exponents, zero/sub-lamport truncation and positive precision preservation.",
      surfaces: [
        "number:0",
        "number:1e-9",
        "number:1e-10",
        "string:0.000",
        "string:1e-9",
        "string:0.0000000009",
        "string:1.25",
        "cli:.5",
        "cli:.000000001",
      ],
    },
    {
      criterion: 1,
      id: "grammar",
      dimension: "representation",
      requirement:
        "Malformed decimal/exponent inputs, negative exponents, repeated and embedded signs reject; no sign normalization can create positive lamports.",
      surfaces: [
        "pure:-1e-9",
        "pure:--1",
        "pure:--1.1",
        "pure:+-1",
        "pure:1-1",
        "pure:1.2.3",
        "pure:1e",
        "pure:1e--9",
        "pure:NaN",
        "pure:Infinity",
      ],
    },
    {
      criterion: 2,
      id: "cli",
      dimension: "failure_timing",
      validator: "native_cli",
      requirement:
        "Native solos CLI invalid inputs yield structured ValidationError and nonzero exit before unusable signer acquisition; each child test has its own timeout.",
      surfaces: [
        "cli.simulate:zero",
        "cli.send:zero",
        "cli.simulate:sub-lamport",
        "cli.send:sub-lamport",
        "cli.simulate:--1",
        "cli.send:--1",
        "cli.simulate:--1.1",
        "cli.send:--1.1",
      ],
    },
    {
      criterion: 2,
      id: "mcp",
      dimension: "failure_timing",
      validator: "mcp",
      requirement:
        "Real stdio MCP simulate/send reject numeric/string zero and sub-lamport inputs before unusable signer Layer acquisition.",
      surfaces: [
        "mcp.simulate:number-zero",
        "mcp.send:number-zero",
        "mcp.simulate:string-zero",
        "mcp.send:string-zero",
        "mcp.simulate:sub-lamport",
        "mcp.send:sub-lamport",
      ],
    },
    {
      criterion: 2,
      id: "positive",
      dimension: "compatibility",
      validator: "integration",
      requirement:
        "One lamport and ordinary positive transfers retain exact amounts against offline Surfpool; Action and swap compatibility unchanged.",
      surfaces: ["cli.simulate:positive", "mcp.simulate:positive", "send:positive"],
    },
    {
      criterion: 3,
      id: "isolation",
      dimension: "qa_environment",
      validator: "integration",
      responsibility: "standards",
      requirement:
        "Every child uses a temporary empty config, missing disposable signer and loopback RPC; no operator profile or mainnet.",
      surfaces: ["cli.environment", "mcp.environment"],
    },
    {
      criterion: 3,
      id: "telemetry",
      dimension: "observability",
      validator: "integration",
      requirement:
        "Early failures preserve error log and span through the caller's logger/tracer configuration.",
      surfaces: ["cli.error-log", "mcp.error-log", "transfer.span"],
    },
    {
      criterion: 3,
      id: "architecture",
      dimension: "architecture",
      validator: "review",
      responsibility: "standards",
      requirement:
        "Telemetry repair keeps Effect.run and Layer.provide in documented composition roots.",
      surfaces: ["composition-root", "caller-config"],
    },
    {
      criterion: 4,
      id: "evidence",
      validator: "review",
      requirement: "Clean exact-head Evidence and required full offline checks pass.",
      surfaces: ["evidence", "ci.full"],
    },
    {
      criterion: 5,
      id: "operator",
      validator: "native_cli",
      responsibility: "operator",
      requirement:
        "Operator reports zero rejection with no submitted transaction; positive funds separately accounted.",
      surfaces: ["operator.cli", "operator.mcp"],
    },
  ],
};

export const transferReplay = () => replayContract(contract);
