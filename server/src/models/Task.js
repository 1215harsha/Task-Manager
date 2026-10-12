/**
 * Task.js — Mongoose schema and model for tasks.
 *
 * A task belongs to one project and is assigned to one team member.
 * Only admins can create or delete tasks.
 * Members can update the status of tasks assigned to them.
 *
 * Fields:
 *  title       – Short description of what needs to be done.
 *  description – Optional longer explanation.
 *  project     – Which project this task belongs to.
 *  assignedTo  – Which user is responsible for completing it.
 *  createdBy   – Which admin created the task (audit trail).
 *  status      – Current progress: "todo" → "in-progress" → "done".
 *  priority    – Urgency level: "low", "medium", or "high".
 *  dueDate     – Deadline. Tasks past this date with status ≠ "done" are overdue.
 *
 * Indexes support the most common query patterns used by the dashboard and task list.
 */

import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: 2,
      maxlength: 160
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: ""
    },
    // Foreign key → Project collection
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true
    },
    // Foreign key → User collection (the member doing the work)
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // Foreign key → User collection (the admin who created the task)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      enum: ["todo", "in-progress", "done"],
      default: "todo"
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"]
    }
  },
  {
    timestamps: true // auto-adds createdAt / updatedAt
  }
);

// Index: filter tasks by project AND status — common for the task list view.
taskSchema.index({ project: 1, status: 1 });

// Index: filter tasks by assignee AND status — used when a member views their own tasks.
taskSchema.index({ assignedTo: 1, status: 1 });

// Index: sort/filter by due date — used for overdue and "due soon" queries.
taskSchema.index({ dueDate: 1 });

export const Task = mongoose.model("Task", taskSchema);
