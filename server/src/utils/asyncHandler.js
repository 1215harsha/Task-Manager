/**
 * asyncHandler.js — Utility wrapper for async Express route handlers.
 *
 * Problem:
 *   Express does not automatically catch errors thrown inside async functions.
 *   If you write:
 *     router.get("/foo", async (req, res) => { throw new Error("boom"); })
 *   Express will hang and never respond.
 *
 * Solution:
 *   Wrap every async handler with asyncHandler().
 *   It calls the handler, and if the returned Promise rejects, it forwards
 *   the error to Express's next() so the global errorHandler middleware picks it up.
 *
 * Usage:
 *   router.get("/foo", asyncHandler(async (req, res) => { ... }));
 */

export const asyncHandler = (handler) => (req, res, next) => {
  // Execute the handler; catch any rejection and pass it to next().
  Promise.resolve(handler(req, res, next)).catch(next);
};
