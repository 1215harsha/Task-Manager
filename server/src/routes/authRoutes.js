/**
 * authRoutes.js — Authentication API endpoints.
 *
 * POST /api/auth/signup  – Create a new account and return user + token.
 * POST /api/auth/login   – Validate credentials and return user + token.
 * GET  /api/auth/me      – Return the currently logged-in user (requires token).
 *
 * Flow:
 *  1. Request body is validated against a Zod schema (rejects bad input immediately).
 *  2. Business logic runs (hash password, check credentials, etc.)
 *  3. A JWT is signed with signToken() and returned to the client.
 *  4. The client stores the token and sends it as "Authorization: Bearer <token>"
 *     on future requests.
 */

import express   from "express";
import bcrypt    from "bcryptjs";
import { z }     from "zod";
import { User }        from "../models/User.js";
import { authenticate }    from "../middleware/auth.js";
import { validateBody }    from "../middleware/validate.js";
import { AppError }        from "../utils/AppError.js";
import { asyncHandler }    from "../utils/asyncHandler.js";
import { signToken }       from "../utils/tokens.js";

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────
// .strict() rejects any extra fields the client sends that aren't defined here.

const signupSchema = z.object({
  name:     z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email:    z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  role:     z.enum(["admin", "member"]).optional() // defaults to "member" in the handler
}).strict();

const loginSchema = z.object({
  email:    z.string().trim().email("Enter a valid email").toLowerCase(),
  password: z.string().min(1, "Password is required")
}).strict();

// ─── POST /api/auth/signup ───────────────────────────────────────────────────
router.post(
  "/signup",
  validateBody(signupSchema),    // reject bad input before hitting the DB
  asyncHandler(async (req, res) => {
    const { name, email, password, role = "member" } = req.body;

    // Check for duplicate email before creating the user.
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError("Email already exists", 409);
    }

    // bcrypt.hash(password, 12): the second argument is the "cost factor".
    // 12 means 2^12 = 4096 iterations — slow enough to resist brute-force but
    // fast enough not to noticeably delay sign-up.
    const passwordHash = await bcrypt.hash(password, 12);
    const user         = await User.create({ name, email, passwordHash, role });
    const token        = signToken(user);

    res.status(201).json({ user, token });
  })
);

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // We need the hash to compare, so we must explicitly select it
    // (it is excluded from results by default — see User.js).
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      // Use the same generic message for wrong email OR wrong password so
      // attackers can't tell which one was incorrect (timing-safe approach).
      throw new AppError("Invalid email or password", 401);
    }

    // bcrypt.compare safely compares the plain-text password with the stored hash.
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError("Invalid email or password", 401);
    }

    const token = signToken(user);
    res.json({ user, token });
  })
);

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
// Returns the user profile for whoever owns the token.
// The authenticate middleware already loaded the user into req.user.
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
