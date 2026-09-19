// @ts-check
import { z } from "zod";
import { MatrixSchema, ReviewSchema } from "./schema.js";

export const matrixOutputSchema = z.json().parse(z.toJSONSchema(MatrixSchema));
export const reviewOutputSchema = z.json().parse(z.toJSONSchema(ReviewSchema));
