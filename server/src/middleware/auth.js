/**
 * auth.js — Authentication & authorisation middleware.
 *
 * authenticate:
 *   Reads the JWT from the "Authorization: Bearer <token>" header,
 *   verifies it, loads the matching User from the database, and
 *   attaches the user object to req.user for downstream handlers.
 *
 * requireRoles(...roles):
 *   A factory that returns a middleware which checks req.user.role
 *   against the list of permitted roles. Use after authenticate.
 *
 * Usage:
 *   router.get("/admin-only", authenticate, requireRoles("admin"), handler);
 *   router.patch("/tasks/:id", authenticate, handler); // any authenticated user
 */

import jwt from "jsonwebtoken";
import { AppError }      from "../utils/AppError.js";
import { asyncHandler }  from "../utils/asyncHandler.js";
import { User }          from "../models/User.js";

/**
 * Middleware: verifies the Bearer token and populates req.user.
 * Throws 401 if the token is missing, invalid, or the user was deleted.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  // Read the raw Authorization header value, e.g. "Bearer eyJhbGciOi..."
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AppError("Authentication required", 401);
  }

  // jwt.verify throws if the signature is bad or the token has expired.
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  // Look up the user to ensure the account still exists.
  const user = await User.findById(payload.userId);

  if (!user) {
    throw new AppError("User no longer exists", 401);
  }

  // Attach the user to the request so later handlers can use req.user.
  req.user = user;
  next();
});

/**
 * Middleware factory: restricts access to users whose role is in `roles`.
 * Must be used AFTER authenticate (so req.user is already set).
 *
 * @param {...string} roles - Allowed roles, e.g. "admin" or "admin", "member".
 */
export const requireRoles = (...roles) => {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError("You do not have permission to perform this action", 403);
    }
    next();
  };
};
