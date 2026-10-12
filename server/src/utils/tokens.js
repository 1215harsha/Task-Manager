/**
 * tokens.js — JWT (JSON Web Token) creation helper.
 *
 * A JWT is a compact, signed string that the server gives to the client after
 * login. The client stores it and sends it back in the Authorization header
 * on every subsequent request. The server verifies the signature to trust the
 * contents without needing a database lookup for every request.
 *
 * Token payload contains: { userId, role }
 * Token is signed with JWT_SECRET from .env
 * Token expires after JWT_EXPIRES_IN (default 7 days)
 */

import jwt from "jsonwebtoken";

/**
 * Creates and returns a signed JWT for the given user.
 *
 * @param {Object} user         - Mongoose User document.
 * @param {string} user._id     - MongoDB ObjectId.
 * @param {string} user.role    - "admin" or "member".
 * @returns {string}            - Signed JWT string.
 */
export const signToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(), // store as string to avoid ObjectId serialisation issues
      role:   user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d" // token lifetime
    }
  );
};
