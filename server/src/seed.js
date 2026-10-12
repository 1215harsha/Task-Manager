/**
 * seed.js — Populates the database with demo data for development/testing.
 *
 * Run with:  npm run seed --workspace server
 *   (or from the server folder: node src/seed.js)
 *
 * What it creates (only if they don't already exist):
 *  - 1 Admin user:  admin@example.com  / Admin123
 *  - 1 Member user: member@example.com / Member123
 *  - 1 Project:     "Launch Plan"
 *  - 2 Tasks:       one "in-progress", one "todo"
 *
 * Safe to run multiple times — it uses upsert logic (find before create).
 */

import dotenv  from "dotenv";
import bcrypt  from "bcryptjs";
import path    from "path";
import { fileURLToPath } from "url";
import { connectDB }  from "./config/db.js";
import { Project }    from "./models/Project.js";
import { Task }       from "./models/Task.js";
import { User }       from "./models/User.js";

// Reconstruct __dirname for ES Modules (it is not available by default).
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Finds an existing user by email, or creates a new one.
 * This makes the seed idempotent — safe to run more than once.
 */
const upsertUser = async ({ name, email, password, role }) => {
  const existing = await User.findOne({ email });
  if (existing) return existing; // already exists — skip creation

  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({ name, email, passwordHash, role });
};

const run = async () => {
  await connectDB();

  // ─── Create demo users ────────────────────────────────────────────────────
  const admin = await upsertUser({
    name:     "Demo Admin",
    email:    "admin@example.com",
    password: "Admin123",
    role:     "admin"
  });

  const member = await upsertUser({
    name:     "Demo Member",
    email:    "member@example.com",
    password: "Member123",
    role:     "member"
  });

  // ─── Create demo project ──────────────────────────────────────────────────
  let project = await Project.findOne({ name: "Launch Plan" });

  if (!project) {
    project = await Project.create({
      name:        "Launch Plan",
      description: "Coordinate release tasks and track launch readiness.",
      owner:       admin._id,
      members:     [member._id] // the demo member can receive tasks in this project
    });
  }

  // ─── Create demo tasks (only if none exist yet) ───────────────────────────
  const taskCount = await Task.countDocuments({ project: project._id });

  if (taskCount === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1); // due tomorrow

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7); // due in 7 days

    await Task.create([
      {
        title:       "Prepare landing copy",
        description: "Write concise product messaging for the first release.",
        project:     project._id,
        assignedTo:  member._id,
        createdBy:   admin._id,
        status:      "in-progress",
        priority:    "high",
        dueDate:     tomorrow
      },
      {
        title:       "QA task workflow",
        description: "Check member status updates and dashboard counts.",
        project:     project._id,
        assignedTo:  member._id,
        createdBy:   admin._id,
        status:      "todo",
        priority:    "medium",
        dueDate:     nextWeek
      }
    ]);
  }

  // Print login credentials to the terminal for easy reference.
  console.log("✅ Seed complete");
  console.log("   Admin:  admin@example.com  / Admin123");
  console.log("   Member: member@example.com / Member123");
  process.exit(0);
};

run().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
