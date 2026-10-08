// @ts-check
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import importX from "eslint-plugin-import-x";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

const SLICE = "packages/core/src/(?!shared)([^/]+)";

/** Architectural element types (ADR-0004). Captured `slice` lets policies say "same slice only". */
const elements = [
  { type: "actions", pattern: "packages/actions/src/**", partialMatch: false },
  { type: "core-shared", pattern: "packages/core/src/shared/**", partialMatch: false },
  { type: "core-domain", pattern: `${SLICE}/domain/**`, partialMatch: false, capture: ["slice"] },
  { type: "core-ports", pattern: `${SLICE}/ports/**`, partialMatch: false, capture: ["slice"] },
  {
    type: "core-use-cases",
    pattern: `${SLICE}/use-cases/**`,
    partialMatch: false,
    capture: ["slice"],
  },
  { type: "core-tools", pattern: `${SLICE}/tools/**`, partialMatch: false, capture: ["slice"] },
  { type: "solana", pattern: "packages/solana/src/**", partialMatch: false },
  { type: "mcp", pattern: "packages/mcp/src/**", partialMatch: false },
  { type: "harness", pattern: "apps/harness/src/**", partialMatch: false },
  { type: "cli", pattern: "apps/cli/src/**", partialMatch: false },
  { type: "landing", pattern: "apps/landing/src/**", partialMatch: false },
  { type: "scripts", pattern: "scripts/**", partialMatch: false },
];

/** @param {string} type */
const to = (type) => ({ to: { element: { type } } });
/** @param {string} type */
const toSameSlice = (type) => ({ to: { element: { type, slice: "{{from.slice}}" } } });
/** @param {string} type @param {unknown[]} allow */
const policy = (type, allow) => ({ from: { element: { type } }, allow });

const complexity = {
  complexity: ["error", 8],
  "max-depth": ["error", 3],
  // ESLint bounds logical source lines; check:lines owns the physical-line changed-file gate.
  "max-lines": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
  "max-nested-callbacks": ["error", 3],
  "max-params": ["error", 3],
  "max-statements": ["error", 20],
  "no-nested-ternary": "error",
};

const importRules = {
  "import-x/no-default-export": "error",
  "import-x/no-cycle": "error",
  // tsc owns symbol resolution; the ESLint resolver cannot see Bun's isolated node_modules.
  "import-x/no-unresolved": "off",
  "import-x/named": "off",
  "import-x/order": [
    "error",
    {
      groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
      pathGroups: [{ pattern: "bun:*", group: "builtin", position: "before" }],
      pathGroupsExcludedImportTypes: [],
      alphabetize: { order: "asc", caseInsensitive: true },
      "newlines-between": "never",
    },
  ],
};

const unicornRules = {
  "unicorn/filename-case": ["error", { case: "kebabCase" }],
  "unicorn/no-null": "off",
  "unicorn/prevent-abbreviations": "off",
  "unicorn/name-replacements": "off",
  "unicorn/no-array-reduce": "off",
  "unicorn/no-process-exit": "off",
  "unicorn/prefer-top-level-await": "off",
  "unicorn/no-useless-undefined": "off",
  // JSDoc one-liners (`/** @type {X} */`) are the typing mechanism in this repo.
  "unicorn/single-line-block-comment-style": "off",
  // False positives on Effect.map(Tag, fn), Logger.replace(...) and similar non-Array/String APIs.
  "unicorn/no-array-callback-reference": "off",
  "unicorn/no-array-method-this-argument": "off",
  "unicorn/no-unsafe-string-replacement": "off",
  // Effect pipelines nest by design; `complexity` and `max-depth` already bound size.
  "unicorn/max-nested-calls": "off",
  // Promise-combinator style is fine where it reads better than try/await.
  "unicorn/prefer-await": "off",
  "unicorn/no-await-expression-member": "off",
  // Memoised module singletons (`shared ??= start()`) are intentional.
  "unicorn/no-top-level-assignment-in-function": "off",
};

const boundaryRules = {
  "boundaries/no-unknown-files": "error",
  "boundaries/dependencies": [
    "error",
    {
      default: "disallow",
      policies: [
        // Third-party modules are allowed here; "core must not import Kit/MCP/AI SDK" is enforced by
        // dependency-cruiser (`core-has-no-io-deps`), which sees unresolved externals reliably.
        { from: { element: { type: "*" } }, allow: { to: { module: { origin: "external" } } } },
        // The published contract package is pure schemas: everything may import it, it imports nothing.
        policy("actions", [to("actions")]),
        policy("core-shared", [to("actions"), to("core-shared")]),
        policy("core-domain", [to("actions"), to("core-shared"), toSameSlice("core-domain")]),
        policy("core-ports", [
          to("actions"),
          to("core-shared"),
          toSameSlice("core-domain"),
          toSameSlice("core-ports"),
        ]),
        policy("core-use-cases", [
          to("actions"),
          to("core-shared"),
          toSameSlice("core-domain"),
          toSameSlice("core-ports"),
          toSameSlice("core-use-cases"),
        ]),
        policy("core-tools", [
          to("actions"),
          to("core-shared"),
          toSameSlice("core-domain"),
          toSameSlice("core-ports"),
          toSameSlice("core-use-cases"),
          toSameSlice("core-tools"),
        ]),
        policy("solana", [to("actions"), to("solana")]),
        policy("mcp", [to("actions"), to("mcp")]),
        policy("harness", [to("actions"), to("harness")]),
        policy("cli", [to("actions"), to("cli")]),
        policy("landing", [to("landing")]),
        policy("scripts", [to("scripts")]),
      ],
    },
  ],
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      ".solos/**",
      ".claude/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  importX.flatConfigs.recommended,
  unicorn.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, Bun: "readonly" },
    },
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      // Index files are barrels; cross-slice discipline through them is dependency-cruiser's job.
      "boundaries/ignore": [
        "**/*.test.js",
        "eslint.config.js",
        "harness.config.js",
        "packages/core/src/index.js",
        "packages/core/src/*/index.js",
      ],
      "import-x/resolver": { node: { extensions: [".js"] } },
    },
    rules: {
      ...complexity,
      ...importRules,
      ...unicornRules,
      ...boundaryRules,
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["error"] }],
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.test.js"],
    rules: {
      complexity: "off",
      "unicorn/no-duplicate-loops": "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
      "max-nested-callbacks": "off",
      // Test scenarios may stay together up to the matching 300-physical-line gate.
      "max-lines": ["error", { max: 300 }],
    },
  },
  {
    files: ["harness.config.js", "eslint.config.js", ".dependency-cruiser.cjs"],
    rules: {
      "import-x/no-default-export": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
      "max-lines": "off",
    },
  },
  {
    files: ["scripts/**"],
    rules: { "unicorn/no-global-object-property-assignment": "off" },
  },
];
