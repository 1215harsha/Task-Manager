/**
 * storage.js — Safe localStorage wrapper.
 *
 * Why not use localStorage directly?
 *   In some browser environments (private browsing, security policies, iframes)
 *   localStorage.getItem/setItem throws a SecurityError instead of returning null.
 *   This wrapper catches those errors so the rest of the app can use it without
 *   try/catch blocks everywhere.
 *
 * The app uses a single key "ttm_token" to persist the JWT across page reloads.
 *
 * Usage:
 *   import { storage } from "./storage.js";
 *
 *   storage.set("ttm_token", "eyJhbGci..."); // save the token after login
 *   storage.get("ttm_token");               // read the token on startup
 *   storage.remove("ttm_token");            // clear the token on logout
 */

export const storage = {
  /**
   * Reads a value from localStorage.
   * @param {string} key
   * @returns {string|null} The stored string, or null if missing / access denied.
   */
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // localStorage is blocked (private mode / security policy) — treat as empty.
      return null;
    }
  },

  /**
   * Writes a value to localStorage.
   * @param {string} key
   * @param {string} value
   * @returns {boolean} true on success, false if access was denied.
   */
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      return false;
    }
    return true;
  },

  /**
   * Removes a key from localStorage.
   * @param {string} key
   * @returns {boolean} true on success, false if access was denied.
   */
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      return false;
    }
    return true;
  }
};
