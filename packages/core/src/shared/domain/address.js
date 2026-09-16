// @ts-check
/**
 * Address and signature schemas are owned by the published contract package so executors and
 * solOS agree byte for byte. Core re-exports them for slice convenience.
 */
export { AddressSchema, SignatureSchema } from "@solos/actions";

/** @typedef {import("@solos/actions").Address} Address */
/** @typedef {import("@solos/actions").Signature} Signature */
