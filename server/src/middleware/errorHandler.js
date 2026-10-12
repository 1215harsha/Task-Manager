/**
 * errorHandler.js — Centralised Express error handling middleware.
 *
 * notFound   : Turns unmatched routes into a structured 404 error.
 * errorHandler: Converts any error (from AppError, Mongoose, or JWT) into a
 *               JSON response so the client always gets consistent error shape:
 *               { message: "...", stack: "..." (dev only) }
 *
 * Mount order in server.js must be:
 *   app.use(notFound);      ← after all real routes
 *   app.use(errorHandler);  ← last of all
 */

/**
 * Middleware: catches requests that didn't match any route and creates a 404 error.
 * Passes it to the next error-handling middleware (errorHandler below).
 */
export const notFound = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error); // hand off to errorHandler
};

/**
 * Error-handling middleware (4 parameters — Express identifies it by arity).
 * Translates different error types into a consistent HTTP JSON response.
 *
 * Handled error types:
 *  - AppError         → uses error.statusCode
 *  - Mongoose ValidationError → 400 with field messages joined
 *  - MongoDB duplicate key (code 11000) → 409 Conflict
 *  - JWT errors       → 401 Unauthorised
 *  - Everything else  → 500 Internal Server Error
 */
export const errorHandler = (error, _req, res, _next) => {
  let statusCode = error.statusCode || 500;
  let message    = error.message    || "Server error";

  // ─── Mongoose Validation Error ───────────────────────────────────────────
  // Happens when a Mongoose schema required/minlength/etc. rule is violated.
  if (error.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((item) => item.message)
      .join(", ");
  }

  // ─── MongoDB Duplicate Key ───────────────────────────────────────────────
  // Code 11000 means a unique index was violated (e.g. email already exists).
  if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyValue || {})[0] || "field";
    message = `${field} already exists`;
  }

  // ─── JWT Errors ──────────────────────────────────────────────────────────
  // JsonWebTokenError: token is malformed or signature is wrong.
  // TokenExpiredError: token is valid but past its expiry date.
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Invalid or expired token";
  }

  res.status(statusCode).json({
    message,
    // Only include the stack trace in development — never expose it in production.
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });
};
