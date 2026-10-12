/**
 * validate.js — Request body validation middleware (powered by Zod).
 *
 * Zod is a schema-declaration library. You define the shape and rules of
 * expected data as a "schema", and Zod validates incoming JSON against it.
 *
 * validateBody(schema):
 *   Returns a middleware that calls schema.safeParse(req.body).
 *   - If validation passes  → replaces req.body with the parsed (cleaned) data and calls next().
 *   - If validation fails   → throws an AppError(400) with a clear list of what went wrong.
 *
 * Usage in a route file:
 *   import { z } from "zod";
 *   const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
 *   router.post("/login", validateBody(schema), handler);
 */

import { AppError } from "../utils/AppError.js";

/**
 * Factory: creates a validation middleware for a given Zod schema.
 *
 * @param {import("zod").ZodSchema} schema - Zod schema to validate against.
 * @returns Express middleware function.
 */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    // Collect all validation error messages and join them into a single string.
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    throw new AppError(message, 400);
  }

  // Replace req.body with the parsed data — this strips unknown fields
  // and applies default values defined in the schema.
  req.body = result.data;
  next();
};
