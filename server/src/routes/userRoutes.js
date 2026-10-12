/**
 * userRoutes.js — Endpoints to retrieve team member information.
 *
 * GET /api/users       – All users (admin only).
 * GET /api/users/team  – Users visible to the current user.
 *                        Admin: all users.
 *                        Member: themselves + co-members of shared projects.
 *
 * These routes are used by the Team view and by the task-creation form
 * to populate the assignee dropdown.
 */

import express from "express";
import { Project }         from "../models/Project.js";
import { User }            from "../models/User.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { asyncHandler }    from "../utils/asyncHandler.js";

const router = express.Router();

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Restricted to admins. Returns every user in the system.
router.get(
  "/",
  authenticate,
  requireRoles("admin"),
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ name: 1 }).select("name email role createdAt");
    res.json({ users });
  })
);

// ─── GET /api/users/team ──────────────────────────────────────────────────────
// Returns the list of users the current user can "see".
// - Admins: all users (so they can assign tasks to anyone).
// - Members: only themselves and people who share a project with them
//            (so they can see who they are working with).
router.get(
  "/team",
  authenticate,
  asyncHandler(async (req, res) => {
    // Admin fast path — just return everyone.
    if (req.user.role === "admin") {
      const users = await User.find().sort({ name: 1 }).select("name email role createdAt");
      res.json({ users });
      return;
    }

    // Member path: collect all user ids from shared projects.
    const projects = await Project.find({ members: req.user._id }).select("owner members");

    // Start the set with the member's own id so they always appear in the list.
    const userIds = new Set([req.user._id.toString()]);

    projects.forEach((project) => {
      userIds.add(project.owner.toString()); // add the project owner
      project.members.forEach((memberId) => userIds.add(memberId.toString()));
    });

    // Fetch the full user documents for all collected ids.
    const users = await User.find({ _id: { $in: [...userIds] } })
      .sort({ name: 1 })
      .select("name email role createdAt");

    res.json({ users });
  })
);

export default router;
