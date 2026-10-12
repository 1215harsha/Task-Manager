/**
 * main.jsx — React application entry point.
 *
 * This file does three things:
 *  1. Wraps the app in React.StrictMode, which enables extra development warnings.
 *  2. Wraps the app in a class-based ErrorBoundary that catches any React render
 *     crash and shows a fallback UI with a Reload button instead of a blank page.
 *  3. Mounts the <App /> component into the #root div defined in index.html.
 *
 * ErrorBoundary must be a class component because React's error boundary API
 * (getDerivedStateFromError / componentDidCatch) is not available as hooks.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

/**
 * ErrorBoundary — catches unhandled errors in the component tree below it.
 *
 * If any child component throws during rendering, this component renders a
 * friendly fallback instead of crashing the whole page.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null }; // null = no error; Error object = something went wrong
  }

  /**
   * Called automatically by React when a descendant throws.
   * Return value is merged into state.
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      // Render a minimal fallback screen that uses the same auth-panel styles.
      return (
        <main className="auth-shell">
          <section className="auth-panel">
            <p className="eyebrow">Team Task Manager</p>
            <h1>Unable to load the app</h1>
            <div className="alert">
              {this.state.error.message || "Unexpected browser error"}
            </div>
            {/* Reload the page — the simplest recovery action */}
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </section>
        </main>
      );
    }

    // No error: render children normally.
    return this.props.children;
  }
}

// Mount the React app into the <div id="root"> in index.html.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
