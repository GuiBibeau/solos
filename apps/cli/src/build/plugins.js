// @ts-check
/**
 * Bundler plugins `solos dev build` needs to turn the CLI into one executable (ADR-0035). Each
 * works around a dependency the bundler cannot compile as shipped; neither changes behaviour,
 * and neither runs anywhere but at build time.
 */
import path from "node:path";

/**
 * `@solana/kit@2.3.0`, which Kamino's SDKs pin as CommonJS, requires `@solana/rpc-parsed-types`,
 * a types-only package whose runtime module is empty. Bun's bundler (1.3.14 and 1.4.2 alike)
 * emits `var rpcParsedTypes = ;` for that require, and the binary dies with a SyntaxError before
 * main runs. An explicit empty module is what the package means.
 * @type {import("bun").BunPlugin}
 */
export const stubEmptyModules = {
  name: "solos-stub-empty-modules",
  setup(build) {
    build.onResolve({ filter: /^@solana\/rpc-parsed-types$/ }, (args) => ({
      path: args.path,
      namespace: "solos-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "solos-stub" }, () => ({
      contents: "module.exports = {};",
      loader: "js",
    }));
  },
};

const NODEJS_GLUE = /whirlpools-core\/dist\/nodejs\/orca_whirlpools_core_js_bindings\.js$/;

/**
 * `@orca-so/whirlpools-core` (3.1.1 here, 2.0.0 through Kamino) ships wasm-bindgen's nodejs
 * glue: it reads the `.wasm` next to `__dirname`, which the bundler inlines as the build
 * machine's path, and assigns `module.exports` into the import object, which the lifted module
 * no longer has. The package's own browser glue is plain ESM; feed it the wasm embedded in the
 * binary. Instantiation is synchronous because Kamino `require()`s the package and the bundler
 * refuses a top-level await behind a require.
 * @type {import("bun").BunPlugin}
 */
export const embedWhirlpoolsWasm = {
  name: "solos-embed-whirlpools-wasm",
  setup(build) {
    build.onLoad({ filter: NODEJS_GLUE }, (args) => {
      const browser = path.join(path.dirname(path.dirname(args.path)), "browser");
      const glue = JSON.stringify(path.join(browser, "orca_whirlpools_core_js_bindings_bg.js"));
      const wasm = JSON.stringify(path.join(browser, "orca_whirlpools_core_js_bindings_bg.wasm"));
      return {
        loader: "js",
        contents: [
          `import wasmPath from ${wasm} with { type: "file" };`,
          `import * as glue from ${glue};`,
          'import { readFileSync } from "node:fs";',
          "const compiled = new WebAssembly.Module(readFileSync(wasmPath));",
          'const imports = { "./orca_whirlpools_core_js_bindings_bg.js": glue };',
          "glue.__wbg_set_wasm(new WebAssembly.Instance(compiled, imports).exports);",
          `export * from ${glue};`,
        ].join("\n"),
      };
    });
  },
};

export const BUILD_PLUGINS = Object.freeze([stubEmptyModules, embedWhirlpoolsWasm]);
