/**
 * api.js — Centralised HTTP helper for talking to the Express backend.
 *
 * Why have this wrapper instead of calling fetch() directly everywhere?
 *  - Single place to set the base URL, headers, and auth token.
 *  - Automatic error throwing — callers always get either the parsed data
 *    or an Error with a human-readable message.
 *  - 204 No Content responses (from DELETE) are handled gracefully.
 *
 * Usage:
 *   import { apiRequest } from "./api.js";
 *
 *   // GET (no body, no token needed):
 *   const data = await apiRequest("/api/health");
 *
 *   // POST with body and auth token:
 *   const data = await apiRequest("/api/auth/login", {
 *     method: "POST",
 *     body:  { email, password },
 *     token: "eyJhbGci..."
 *   });
 */

// VITE_API_URL lets you point the client at a different server in production.
// In development it is empty so requests go to the same origin (proxied by Vite → localhost:5000).
const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Makes an authenticated or unauthenticated HTTP request to the API.
 *
 * @param {string}  endpoint           - Path starting with "/api/...", e.g. "/api/tasks".
 * @param {Object}  [options]          - Optional config.
 * @param {string}  [options.method]   - HTTP method ("GET", "POST", "PATCH", "DELETE"). Default: "GET".
 * @param {Object}  [options.body]     - JSON body to send (for POST/PATCH). Serialised automatically.
 * @param {string}  [options.token]    - JWT from localStorage; added as "Authorization: Bearer <token>".
 * @returns {Promise<Object|null>}     - Parsed JSON response, or null for 204 No Content.
 * @throws {Error}                     - If the server returns a non-2xx status.
 */
export const apiRequest = async (endpoint, { method = "GET", body, token } = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Spread in the Authorization header only if a token was provided.
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    // fetch ignores body for GET/HEAD; only attach it when there is data to send.
    body: body ? JSON.stringify(body) : undefined
  });

  // 204 No Content has an empty body — calling .json() on it would throw.
  const data = response.status === 204
    ? null
    : await response.json().catch(() => ({})); // fallback to {} if body isn't valid JSON

  // Treat any non-2xx response as an error.
  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
};
