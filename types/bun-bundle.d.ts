/** Compile-time feature flags. `feature()` is only valid in an `if` or ternary. */
declare module "bun:bundle" {
  export function feature(name: string): boolean;
}
