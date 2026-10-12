/**
 * User.js — Mongoose schema and model for application users.
 *
 * Each document in the "users" collection represents one person who can log in.
 *
 * Fields:
 *  name         – Display name (2–80 characters).
 *  email        – Unique login identifier; stored lowercase.
 *  passwordHash – bcrypt hash of the user's password.
 *                 `select: false` means it is NEVER included in query results
 *                 unless you explicitly call .select("+passwordHash").
 *  role         – "admin" can create/delete projects and tasks.
 *                 "member" can only update the status of tasks assigned to them.
 *
 * The toJSON transform strips passwordHash and __v before sending to the client.
 */

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,    // remove leading/trailing whitespace automatically
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,                             // MongoDB index — prevents duplicate emails
      lowercase: true,                          // always stored as lowercase
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Email is invalid"] // basic email format check
    },
    passwordHash: {
      type: String,
      required: true,
      select: false   // never returned by default; must explicitly request with .select("+passwordHash")
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member"
    }
  },
  {
    timestamps: true, // adds createdAt and updatedAt fields automatically
    toJSON: {
      // Transform runs every time a User document is serialised to JSON.
      transform(_doc, ret) {
        delete ret.passwordHash; // never expose the hash to the client
        delete ret.__v;          // remove Mongoose internal version key
        return ret;
      }
    }
  }
);

export const User = mongoose.model("User", userSchema);
