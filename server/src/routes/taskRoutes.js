/**
 * taskRoutes.js — CRUD endpoints for tasks.
 *
 * GET    /api/tasks          – List tasks (filtered by role).
 * POST   /api/tasks          – Create a task (admin only).
 * GET    /api/tasks/:id      – Get a single task.
 * PATCH  /api/tasks/:id      – Update a task.
 *                              Admin: can change any field.
 *                              Member: can only change the status of their own tasks.
 * DELETE /api/tasks/:id      – Delete a task (admin only).
 *
 * Business rule:
 *   A task's assignedTo user MUST be a member of the task's project.
 *   This is enforced in ensureTaskAssignee().
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
const objectIdSchema = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid id");

const statusSchema   = z.enum(["todo", "in-progress", "done"]);
const prioritySchema = z.enum(["low", "medium", "high"]);

const createTaskSchema = z.object({
  title:       z.string().trim().min(2, "Task title must be at least 2 characters").max(160),
  description: z.string().trim().max(1500).optional().default(""),
  project:     objectIdSchema,
  assignedTo:  objectIdSchema,
  status:      statusSchema.optional().default("todo"),
  priority:    prioritySchema.optional().default("medium"),
  // z.coerce.date converts string dates (from JSON) to JS Date objects automatically.
  dueDate: z.coerce.date({ invalid_type_error: "Due date is required" })
}).strict();

// All fields optional for PATCH requests.
const updateTaskSchema = createTaskSchema.partial().extend({
  status: statusSchema.optional()
}).strict();

// ─── Populate Config ──────────────────────────────────────────────────────────
// Used on every task query to replace ObjectIds with actual data.
const taskPopulate = [
  { path: "project",    select: "name description" },
  { path: "assignedTo", select: "name email role" },
  { path: "createdBy",  select: "name email role" }
];

// ─── Helper Functions ─────────────────────────────────────────────────────────
/**
 * Validates that:
 *  1. The project exists.
 *  2. The assignee (user) exists.
 *  3. The assignee is a member of that project.
 *
 * This prevents tasks from being assigned to people outside the project.
 */
const ensureTaskAssignee = async (projectId, assignedToId) => {
  const [project, user] = await Promise.all([
    Project.findById(projectId),
    User.findById(assignedToId).select("name role")
  ]);

  if (!project) throw new AppError("Project not found",       404);
  if (!user)    throw new AppError("Assigned user not found", 404);

  const isProjectMember = project.members.some(
    (memberId) => memberId.toString() === assignedToId.toString()
  );

  if (!isProjectMember) {
    throw new AppError("Assigned user must be a member of the selected project", 400);
  }

  return project;
};

/**
 * Returns true if the user is allowed to read this task.
 * Admins can read any task; members can only read tasks assigned to them.
 */
const userCanReadTask = (task, user) => {
  if (user.role === "admin") return true;

  // task.assignedTo may be a populated object or a raw ObjectId.
  const assignedUserId = task.assignedTo?._id?.toString?.() || task.assignedTo.toString();
  return assignedUserId === user._id.toString();
};

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
// Optional query params: ?projectId=... &status=... &assignedTo=...
router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const query = {};

    // Filter by project if a projectId was provided.
    if (req.query.projectId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.projectId)) {
        throw new AppError("Invalid project id", 400);
      }
      query.project = req.query.projectId;
    }

    // Filter by status if provided.
    if (req.query.status) {
      if (!["todo", "in-progress", "done"].includes(req.query.status)) {
        throw new AppError("Invalid task status", 400);
      }
      query.status = req.query.status;
    }

    if (req.user.role === "member") {
      // Members can only see their own tasks — hard-code the filter.
      query.assignedTo = req.user._id;
    } else if (req.query.assignedTo) {
      // Admins can optionally filter by a specific assignee.
      if (!mongoose.Types.ObjectId.isValid(req.query.assignedTo)) {
        throw new AppError("Invalid assigned user id", 400);
      }
      query.assignedTo = req.query.assignedTo;
    }

    const tasks = await Task.find(query)
      .sort({ dueDate: 1, createdAt: -1 }) // earliest due date first
      .populate(taskPopulate);

    res.json({ tasks });
  })
);

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  requireRoles("admin"),
  validateBody(createTaskSchema),
  asyncHandler(async (req, res) => {
    const { project, assignedTo, title, description, status, priority, dueDate } = req.body;

    // Confirm the assignee is a real project member before creating the task.
    await ensureTaskAssignee(project, assignedTo);

    const task = await Task.create({
      project, assignedTo, title, description, status, priority, dueDate,
      createdBy: req.user._id // track who created this task
    });

    const populatedTask = await Task.findById(task._id).populate(taskPopulate);
    res.status(201).json({ task: populatedTask });
  })
);

// ─── GET /api/tasks/:id ───────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id).populate(taskPopulate);

    if (!task) {
      throw new AppError("Task not found", 404);
    }

    if (!userCanReadTask(task, req.user)) {
      throw new AppError("You do not have access to this task", 403);
    }

    res.json({ task });
  })
);

// ─── PATCH /api/tasks/:id ────────────────────────────────────────────────────
// Members: can only change `status` and only on their own tasks.
// Admins:  can change any field.
router.patch(
  "/:id",
  authenticate,
  validateBody(updateTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError("Task not found", 404);
    }

    // ─── Member path ─────────────────────────────────────────────────────────
    if (req.user.role === "member") {
      // Members can only edit tasks that are assigned to them.
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        throw new AppError("You can only update tasks assigned to you", 403);
      }

      // Members may only change the status field — nothing else.
      const keys = Object.keys(req.body);
      if (keys.some((key) => key !== "status")) {
        throw new AppError("Members can only update task status", 403);
      }

      if (req.body.status) {
        task.status = req.body.status;
      }

      await task.save();
      const populatedTask = await Task.findById(task._id).populate(taskPopulate);
      res.json({ task: populatedTask });
      return;
    }

    // ─── Admin path ──────────────────────────────────────────────────────────
    // If the project or assignee is being changed, re-validate the combination.
    const nextProjectId  = req.body.project    || task.project.toString();
    const nextAssigneeId = req.body.assignedTo || task.assignedTo.toString();
    await ensureTaskAssignee(nextProjectId, nextAssigneeId);

    // Apply all provided updates to the task document.
    Object.entries(req.body).forEach(([key, value]) => {
      task[key] = value;
    });

    await task.save();
    const populatedTask = await Task.findById(task._id).populate(taskPopulate);
    res.json({ task: populatedTask });
  })
);

// ─── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  requireRoles("admin"),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
      throw new AppError("Task not found", 404);
    }

    await task.deleteOne();
    res.status(204).send(); // 204 No Content
  })
);

export default router;
