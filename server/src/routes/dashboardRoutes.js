/**
 * dashboardRoutes.js — Summary statistics for the dashboard view.
 *
 * GET /api/dashboard/summary
 *   Returns counts and task lists that power the dashboard cards and progress bar.
 *
 * Role-based filtering:
 *  - Admin  → sees all projects, all tasks, all users.
 *  - Member → sees only their own assigned tasks and the projects they belong to.
 *
 * Response shape:
 *  {
 *    summary: {
 *      projectCount, totalTasks, totalUsers, overdueTasks,
 *      status: { todo, inProgress, done },
 *      dueSoonTasks: Task[],   ← due within 7 days, not yet done
 *      overdueList:  Task[]    ← past due date, not yet done
 *    }
 *  }
 */

import express from "express";
import { Project }     from "../models/Project.js";
import { Task }        from "../models/Task.js";
import { User }        from "../models/User.js";
import { authenticate }    from "../middleware/auth.js";
import { asyncHandler }    from "../utils/asyncHandler.js";

const router = express.Router();

// ─── GET /api/dashboard/summary ─────────────────────────────────────────────
router.get(
  "/summary",
  authenticate,
  asyncHandler(async (req, res) => {
    const now      = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7); // 7 days from now

    // Build query filters depending on whether the user is an admin or a member.
    const taskQuery    = req.user.role === "admin" ? {} : { assignedTo: req.user._id };
    const projectQuery = req.user.role === "admin" ? {} : { members:    req.user._id };

    // Overdue = not done AND past the due date.
    const overdueQuery = {
      ...taskQuery,
      dueDate: { $lt: now },        // dueDate is in the past
      status:  { $ne: "done" }      // but the task isn't finished yet
    };

    // Run all DB queries in parallel with Promise.all for speed.
    const [
      projectCount,
      totalTasks,
      todoTasks,
      inProgressTasks,
      doneTasks,
      overdueTasks,
      totalUsers,
      dueSoonTasks,
      overdueList
    ] = await Promise.all([
      Project.countDocuments(projectQuery),

      Task.countDocuments(taskQuery),
      Task.countDocuments({ ...taskQuery, status: "todo" }),
      Task.countDocuments({ ...taskQuery, status: "in-progress" }),
      Task.countDocuments({ ...taskQuery, status: "done" }),
      Task.countDocuments(overdueQuery),

      // Members see only fellow members; admins see everyone.
      req.user.role === "admin"
        ? User.countDocuments()
        : User.countDocuments({ role: "member" }),

      // Tasks due within the next 7 days, sorted by earliest first, max 5.
      Task.find({
        ...taskQuery,
        dueDate: { $gte: now, $lte: nextWeek },
        status:  { $ne: "done" }
      })
        .sort({ dueDate: 1 })
        .limit(5)
        .populate("project",    "name")
        .populate("assignedTo", "name email"),

      // Top 5 overdue tasks, earliest deadline first.
      Task.find(overdueQuery)
        .sort({ dueDate: 1 })
        .limit(5)
        .populate("project",    "name")
        .populate("assignedTo", "name email")
    ]);

    res.json({
      summary: {
        projectCount,
        totalTasks,
        totalUsers,
        overdueTasks,
        status: {
          todo:       todoTasks,
          inProgress: inProgressTasks,
          done:       doneTasks
        },
        dueSoonTasks,
        overdueList
      }
    });
  })
);

export default router;
