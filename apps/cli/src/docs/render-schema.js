// @ts-check
/**
 * A tool's arguments as plain rows, read from its Zod schema through JSON Schema so the HTML and
 * Markdown references render the same facts and neither reaches into Zod internals.
 */
import { z } from "zod";

/**
 * @typedef {{ type?: string | string[], enum?: unknown[], anyOf?: Property[], items?: Property,
 *   default?: unknown, description?: string, minimum?: number, maximum?: number }} Property
 * @typedef {{ properties?: Record<string, Property>, required?: string[] }} ObjectSchema
 * @typedef {{ name: string, type: string, required: boolean, description: string, meta: string }} ArgumentRow
 */

/** @param {Property} property @returns {string} */
export const describeType = (property) => {
  if (property.enum) return property.enum.map(String).join(" | ");
  if (property.anyOf) return property.anyOf.map(describeType).join(" | ");
  if (property.type === "array") return `${describeType(property.items ?? {})}[]`;
  return Array.isArray(property.type) ? property.type.join(" | ") : (property.type ?? "any");
};

/** Default and bounds, when the schema has them; empty otherwise. @param {Property} property */
export const describeMeta = (property) => {
  const parts = [];
  if (property.default !== undefined) parts.push(`default ${JSON.stringify(property.default)}`);
  if (property.minimum !== undefined && property.maximum !== undefined)
    parts.push(`${property.minimum} to ${property.maximum}`);
  else if (property.minimum !== undefined) parts.push(`min ${property.minimum}`);
  else if (property.maximum !== undefined) parts.push(`max ${property.maximum}`);
  return parts.join(" · ");
};

/** @param {import("zod").ZodObject} input @returns {ObjectSchema} */
const schemaOf = (input) =>
  /** @type {ObjectSchema} */ (
    /** @type {unknown} */ (z.toJSONSchema(input, { io: "input", unrepresentable: "any" }))
  );

/**
 * One row per declared argument, in declaration order.
 * @param {import("zod").ZodObject} input
 * @returns {ArgumentRow[]}
 */
export const argumentsOf = (input) => {
  const { properties = {}, required = [] } = schemaOf(input);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    type: describeType(property),
    required: required.includes(name),
    description: property.description ?? "",
    meta: describeMeta(property),
  }));
};
