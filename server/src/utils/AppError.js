/**
 * AppError.js — Custom application error class.
 *
 * Why extend Error?
 *   JavaScript's built-in Error only carries a message and a stack trace.
 *   AppError adds an HTTP `statusCode` so the error handler can send the right
 *   HTTP status (400, 401, 403, 404, 409, 500 …) without extra guesswork.
 *
 * Usage:
 *   throw new AppError("Project not found", 404);
 *   throw new AppError("Email already exists", 409);
 */

export class AppError extends Error {
  /**
   * @param {string} message   - Human-readable error description.
   * @param {number} statusCode - HTTP status code (default 500 = Internal Server Error).
   */
  constructor(message, statusCode = 500) {
    super(message);          // sets this.message and this.stack
    this.statusCode = statusCode;
    this.isOperational = true; // flag that separates "expected" errors from programming bugs
  }
}
