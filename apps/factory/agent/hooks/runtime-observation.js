import { defineHook } from "eve/hooks";
import { observeRuntimeEvent } from "../lib/checkpoints/runtime-observer.js";

// eslint-disable-next-line import-x/no-default-export
export default defineHook({ events: { "*": observeRuntimeEvent } });
