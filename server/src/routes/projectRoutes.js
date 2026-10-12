/**
 * projectRoutes.js — CRUD endpoints for projects + member management.
 *
 * GET    /api/projects          – List all projects visible to the current user.
 * POST   /api/projects          – Create a new project (admin only).
 * GET    /api/projects/:id      – Get a single project's details.
 * PATCH  /api/projects/:id      – Update project name/description/members (admin only).
 * PATCH  /api/projects/:id/members – Replace the full member list (admin only).
 * DELETE /api/projects/:id      – Delete a project and all its tasks (admin only).
 *
 * Access rules:
 *  - Admins can do everything.
 *  - Members can only read projects they are a member of.
 */

import express   from "express";
import mongoose  from "mongoose";
import { z }     from "zod";
import { Project }         from "../models/Project.js";
import { Task }            from "../models/Task.js";
import { User }            from "../models/User.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { validateBody }    from "../middleware/validate.js";
import { AppError }        from "../utils/AppError.js";
import { asyncHandler }    from "../utils/asyncHandler.js";

const router = express.Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────
// Reusable validator: checks that a string is a valid MongoDB ObjectId.
const objectIdSchema = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid id");

const createProjectSchema = z.object({
  name:        z.string().trim().min(2, "Project name must be at least 2 characters").max(120),
  description: z.string().trim().max(1000).optional().default(""),
  memberIds:   z.array(objectIdSchema).optional().default([])
}).strict();

// updateProjectSchema: all fields optional so you can patch just one field.
const updateProjectSchema = createProjectSchema.partial().strict();

const membersSchema = z.object({
  memberIds: z.array(objectIdSchema).default([])
}).strict();

// ─── Populate Config ──────────────────────────────────────────────────────────
// Shared populate config: replaces owner/members ObjectIds with actual user objects.
const projectPopulate = [
  { path: "owner",   select: "name email role" },
  { path: "members", select: "name email role" }
];

// ─── Helper Functions ─────────────────────────────────────────────────────────
/** Deduplicates an array of id strings. */
const uniqueIds = (ids) => [...new Set((ids || []).map((id) => id.toString()))];

/**
 * Verifies that every id in `ids` refers to a real User document.
 * Throws 400 if any id is not found.
 * Returns the deduplicated list of ids.
 */
const ensureUsersExist = async (ids) => {
  const distinctIds = uniqueIds(ids);
  const count = await User.countDocuments({ _id: { $in: distinctIds } });

  if (count !== distinctIds.length) {
    throw new AppError("One or more selected users do not exist", 400);
  }

  return distinctIds;
};

/**
 * Returns true if the user is allowed to view the project.
 * Admins see everything; members only see projects they belong to.
 */
const canAccessProject = (project, user) => {
  if (user.role === "admin") return true;

  // project.members may contain plain ObjectIds (before populate) or full user objects (after).
  return project.members.some(
    (member) =>
      member._id?.toString?.() === user._id.toString() ||
      member.toString()        === user._id.toString()
  );
};

// ─── GET /api/projects ────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    // Admins get all projects; members only get ones they belong to.
    const query    = req.user.role === "admin" ? {} : { members: req.user._id };
    const projects = await Project.find(query)
      .sort({ createdAt: -1 })  // newest first
      .populate(projectPopulate);

    res.json({ projects });
  })
);

// ─── POST /api/projects ───────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  requireRoles("admin"),           // only admins can create projects
  validateBody(createProjectSchema),
  asyncHandler(async (req, res) => {
    const { name, description, memberIds } = req.body;

    // Verify every provided member id actually exists in the DB.
    const members = await ensureUsersExist(memberIds);

    const project = await Project.create({
      name,
      description,
      owner: req.user._id, // the logged-in admin becomes the owner
      members
    });

    const populatedProject = await Project.findById(project._id).populate(projectPopulate);
    res.status(201).json({ project: populatedProject });
  })
);

// ─── GET /api/projects/:id ────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id).populate(projectPopulate);

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    if (!canAccessProject(project, req.user)) {
      throw new AppError("You do not have access to this project", 403);
    }

    res.json({ project });
  })
);

// ─── PATCH /api/projects/:id ──────────────────────────────────────────────────
// General-purpose update: name, description, or members can all be changed.
router.patch(
  "/:id",
  authenticate,
  requireRoles("admin"),
  validateBody(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    // Only update the fields that were actually sent in the request body.
    if (req.body.memberIds) {
      project.members = await ensureUsersExist(req.body.memberIds);
    }
    if (req.body.name        !== undefined) project.name        = req.body.name;
    if (req.body.description !== undefined) project.description = req.body.description;

    await project.save();
    const populatedProject = await Project.findById(project._id).populate(projectPopulate);
    res.json({ project: populatedProject });
  })
);

// ─── PATCH /api/projects/:id/members ─────────────────────────────────────────
// Dedicated endpoint to replace the entire member list at once.
// The UI sends the full desired member list and we overwrite — simpler than
// having separate add/remove endpoints.
router.patch(
  "/:id/members",
  authenticate,
  requireRoles("admin"),
  validateBody(membersSchema),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    // Replace the member list with the validated, deduplicated ids.
    project.members = await ensureUsersExist(req.body.memberIds);
    await project.save();

    const populatedProject = await Project.findById(project._id).populate(projectPopulate);
    res.json({ project: populatedProject });
  })
);

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────
// Cascades: deleting a project also deletes all tasks that belong to it.
router.delete(
  "/:id",
  authenticate,
  requireRoles("admin"),
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);

    if (!project) {
      throw new AppError("Project not found", 404);
    }

    // Delete all tasks that reference this project first (cascade delete).
    await Task.deleteMany({ project: project._id });

    // Then delete the project itself.
    await project.deleteOne();

    res.status(204).send(); // 204 No Content — success with no response body
  })
);

export default router;
