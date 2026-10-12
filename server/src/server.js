/**
 * server.js — Entry point for the Express API server.
 *
 * Responsibilities:
 *  1. Load environment variables from .env
 *  2. Set up Express middleware (security, CORS, JSON parsing, logging, rate-limiting)
 *  3. Mount all API route groups under /api
 *  4. Serve the built React app in production
 *  5. Connect to MongoDB and start listening
 */

// ─── Environment Variables ───────────────────────────────────────────────────
// dotenv reads the .env file and puts every key into process.env.
// We do this ONCE here at the very top so every later import can use process.env.
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname is not available in ES Modules, so we reconstruct it.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env that lives one directory above this file (inside server/)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Guard: crash early with a clear message if critical secrets are missing.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required – add it to server/.env");
}
if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required – add it to server/.env");
}

// ─── Express & Middleware Imports ────────────────────────────────────────────
import express   from "express";
import cors      from "cors";
import helmet    from "helmet";
import rateLimit from "express-rate-limit";
import morgan    from "morgan";

// ─── Internal Modules ────────────────────────────────────────────────────────
import { connectDB }      from "./config/db.js";
import authRoutes         from "./routes/authRoutes.js";
import dashboardRoutes    from "./routes/dashboardRoutes.js";
import projectRoutes      from "./routes/projectRoutes.js";
import taskRoutes         from "./routes/taskRoutes.js";
import userRoutes         from "./routes/userRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// ─── App Setup ───────────────────────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 5000;
const host = process.env.HOST || "0.0.0.0";

// ─── CORS Configuration ──────────────────────────────────────────────────────
// List of front-end origins that are allowed to call this API.
const allowedOrigins = [
  process.env.CLIENT_URL,      // value from .env (e.g. https://yourapp.com)
  "http://localhost:5173",      // Vite dev server
  "http://127.0.0.1:5173"
].filter(Boolean); // remove undefined/null entries

/**
 * Returns true if the request origin is permitted to talk to this server.
 * In development (NODE_ENV !== "production") every origin is allowed so you
 * don't have to keep updating the list while iterating.
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // same-origin or server-to-server requests have no Origin header

  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
    return true;
  }

  // Also allow any Railway deployment subdomain automatically.
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".up.railway.app") || hostname.endsWith(".railway.app");
  } catch {
    return false;
  }
};

// ─── Security & Utility Middleware ───────────────────────────────────────────
// helmet sets safe HTTP headers (XSS protection, no MIME-sniffing, etc.)
app.use(helmet({ contentSecurityPolicy: false }));

// cors lets the browser know which origins are allowed to read our responses.
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true // allow cookies / Authorization headers
}));

// Parse incoming JSON bodies (max 1 MB to prevent giant payloads).
app.use(express.json({ limit: "1mb" }));

// morgan logs every request to the console so you can see what is happening.
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate-limiter: max 300 API requests per IP per 15 minutes.
// This prevents brute-force and denial-of-service attacks.
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes in milliseconds
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// ─── Health Check ────────────────────────────────────────────────────────────
// A quick endpoint you can ping to confirm the server is alive.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "Team Task Manager" });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);      // login, signup, /me
app.use("/api/dashboard", dashboardRoutes); // summary stats
app.use("/api/projects",  projectRoutes);   // CRUD for projects + member management
app.use("/api/tasks",     taskRoutes);      // CRUD for tasks
app.use("/api/users",     userRoutes);      // team member list

// ─── Production Static File Serving ─────────────────────────────────────────
// In production, the React app is compiled to client/dist.
// Express serves those static files and lets React Router handle navigation.
const clientDist = path.resolve(__dirname, "../../client/dist");

if (process.env.NODE_ENV === "production" && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));

  // For any route that is NOT an API call, return the React index.html so
  // the React Router can take over client-side navigation.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next(); // let the 404 handler below deal with unknown API routes
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ─── Error Handling ──────────────────────────────────────────────────────────
// notFound: turns unmatched routes into a 404 error object.
app.use(notFound);
// errorHandler: formats any thrown error into a JSON response.
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB(); // connect to MongoDB first
  app.listen(port, host, () => {
    console.log(`✅ Server running at http://${host}:${port}`);
    console.log(`   Environment: ${process.env.NODE_ENV}`);
  });
};

start().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
