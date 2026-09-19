// @ts-check
import { z } from "zod";

const text = z.string().trim().min(1);
const revision = z.string().regex(/^[\da-f]{40}$/i, "Exact commit SHA required");
export const CriterionSchema = z.strictObject({
  id: text,
  text: z.string().min(1),
  source: z.url(),
  required_surfaces: z.array(text),
});
export const STATES = /** @type {const} */ ([
  "pass",
  "fail",
  "pending",
  "blocked",
  "not_applicable",
]);
const ProofSchema = z.strictObject({
  kind: z.enum(["behavioral", "inspection", "planned"]),
  revision,
  surface: text,
  reference: text,
  observation: text,
  source: z.strictObject({ url: z.url(), quote: text }).nullable(),
  outcome: z.enum(["pass", "fail", "pending"]),
});
const RowSchema = z.strictObject({
  id: text,
  criterion_id: text,
  requirement: text,
  dimension: z.enum([
    "criterion",
    "representation",
    "domain",
    "identity",
    "surface",
    "failure_timing",
    "compatibility",
    "observability",
    "qa_environment",
    "architecture",
  ]),
  surfaces: z.array(text).min(1),
  validator: z.enum(["pure", "integration", "native_cli", "mcp", "review"]),
  responsibility: z.enum(["spec", "standards", "maintainer", "operator", "ci"]),
  proof_kind: z.enum(["behavioral", "inspection"]),
  prerequisite_ids: z.array(text),
  state: z.enum(["pass", "fail", "pending", "blocked", "not_applicable"]),
  reason: text.nullable(),
  proofs: z.array(ProofSchema),
});
const PrerequisiteSchema = z.strictObject({
  id: text,
  criterion_ids: z.array(text).min(1),
  state: z.enum(["resolved", "pending", "blocked", "conflict"]),
  decision: text,
  source: z.url().nullable(),
  revision: z
    .string()
    .regex(
      /^(?:[\da-f]{40}|v?\d+\.\d+\.\d+(?:[-+][\da-z.-]+)?)$/i,
      "Pinned commit or exact release required",
    )
    .nullable(),
  verification: z.enum(["merged_contract", "pinned_research", "unverified"]),
  maintainer_action: text.nullable(),
});
const FindingSchema = z.strictObject({
  id: text,
  row_ids: z.array(text).min(1),
  lane: z.enum(["spec", "standards"]),
  detail: text,
  state: z.enum(["open", "resolved"]),
  resolution: z.array(ProofSchema).nullable(),
});
export const MatrixSchema = z.strictObject({
  criteria: z.array(CriterionSchema),
  rows: z.array(RowSchema),
  prerequisites: z.array(PrerequisiteSchema),
  findings: z.array(FindingSchema),
  summary: z.strictObject({
    pass: z.int().nonnegative(),
    fail: z.int().nonnegative(),
    pending: z.int().nonnegative(),
    blocked: z.int().nonnegative(),
    not_applicable: z.int().nonnegative(),
  }),
});
export const ReviewSchema = z.strictObject({
  lane: z.enum(["spec", "standards"]),
  revision,
  reviewed_row_ids: z.array(text),
  deferred_row_ids: z.array(text),
  verdict: z.enum(["approve", "approve_draft", "request_changes", "reject"]),
});
export const ValidationSchema = z.strictObject({
  originals: z.array(CriterionSchema).min(1),
  matrix: MatrixSchema,
  previous: MatrixSchema.nullable(),
  revision,
  reviews: z.array(ReviewSchema),
  phase: z.enum(["analysis", "review"]),
});
/** @typedef {z.infer<typeof MatrixSchema>} Matrix */
/** @typedef {z.infer<typeof RowSchema>} Row */
/** @typedef {z.infer<typeof ProofSchema>} Proof */
/** @typedef {z.infer<typeof FindingSchema>} Finding */
/** @typedef {z.infer<typeof ValidationSchema>} Validation */
