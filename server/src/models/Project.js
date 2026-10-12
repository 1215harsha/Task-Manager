/**
 * Project.js — Mongoose schema and model for projects.
 *
 * A project groups related tasks together and has a list of members who can
 * be assigned tasks within it.
 *
 * Fields:
 *  name        – Short, human-readable project name.
 *  description – Optional longer explanation of the project's purpose.
 *  owner       – Reference to the User who created the project (always an admin).
 *  members     – Array of User references; only these users can be assigned tasks.
 *
 * Indexes speed up common lookups:
 *  { name, owner } – fast check for duplicate project names per owner.
 *  { members }     – fast query "projects where this user is a member".
 */

import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    // owner is a foreign key — it stores the _id of a User document.
    // `ref: "User"` tells Mongoose to populate this field from the users collection.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // members is an array of User foreign keys.
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    timestamps: true // auto-adds createdAt / updatedAt
  }
);

// Compound index: look up projects by owner and name quickly.
projectSchema.index({ name: 1, owner: 1 });

// Index on members array: finding all projects a user belongs to is a common query.
projectSchema.index({ members: 1 });

export const Project = mongoose.model("Project", projectSchema);
