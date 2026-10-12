/**
 * App.jsx — Root React component and the entire front-end application.
 *
 * Architecture overview:
 * ┌──────────────────────────────────────────────────────────┐
 * │  App (state owner)                                       │
 * │  ├── AuthScreen  (shown when no token / not logged in)   │
 * │  └── AppShell    (shown when logged in)                  │
 * │       ├── Sidebar  (navigation)                          │
 * │       └── Main content — switches between views:         │
 * │            ├── Dashboard   (stats + task previews)       │
 * │            ├── ProjectsView (project list + create form) │
 * │            ├── TasksView    (task list + create form)    │
 * │            └── TeamView     (team member cards)          │
 * └──────────────────────────────────────────────────────────┘
 *
 * All server communication goes through apiRequest() in api.js.
 * The JWT is persisted to localStorage via storage.js so the user stays
 * logged in across page reloads.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users
} from "lucide-react";
import { apiRequest } from "./api.js";
import { storage }    from "./storage.js";

// ─── Constants ───────────────────────────────────────────────────────────────
// Human-readable labels for status and priority values stored in the DB.
const statusLabels = {
  todo:          "Todo",
  "in-progress": "In Progress",
  done:          "Done"
};

const priorityLabels = {
  low:    "Low",
  medium: "Medium",
  high:   "High"
};

// Navigation items rendered in the sidebar.
const navItems = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "projects",  label: "Projects",  icon: FolderKanban },
  { key: "tasks",     label: "Tasks",     icon: ListTodo },
  { key: "team",      label: "Team",      icon: Users }
];

// ─── Empty form templates ─────────────────────────────────────────────────────
// Using constants avoids re-creating these objects on every render.

const emptyAuthForm = {
  name:     "",
  email:    "",
  password: "",
  role:     "member"
};

const emptyProjectForm = {
  name:        "",
  description: "",
  memberIds:   []
};

const emptyTaskForm = {
  title:       "",
  description: "",
  project:     "",
  assignedTo:  "",
  status:      "todo",
  priority:    "medium",
  dueDate:     ""
};

// ─── Utility Functions ────────────────────────────────────────────────────────

/** Formats a date value into a readable string like "Jan 5, 2025". */
function formatDate(value) {
  if (!value) return "No date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day:   "numeric",
    year:  "numeric"
  }).format(new Date(value));
}

/** Returns true if a task is past its due date and not yet done. */
function isOverdue(task) {
  return task.status !== "done" && new Date(task.dueDate) < new Date();
}

/** Safely extracts a user-facing error message from an Error or unknown value. */
function getErrorMessage(error) {
  return error?.message || "Something went wrong";
}

// ─── App (Root Component) ─────────────────────────────────────────────────────
export default function App() {
  // ── Authentication state ─────────────────────────────────────────────────
  // token: the JWT string from localStorage (null if not logged in).
  // user:  the full user object returned by /api/auth/me.
  const [token,    setToken]    = useState(() => storage.get("ttm_token")); // lazy init from localStorage
  const [user,     setUser]     = useState(null);
  const [authMode, setAuthMode] = useState("login");  // "login" | "signup"
  const [authForm, setAuthForm] = useState(emptyAuthForm);

  // ── Navigation state ─────────────────────────────────────────────────────
  const [view, setView] = useState("dashboard"); // matches navItems[].key

  // ── Data state ───────────────────────────────────────────────────────────
  const [projects,  setProjects]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [users,     setUsers]     = useState([]);
  const [dashboard, setDashboard] = useState(null);

  // ── Form state ───────────────────────────────────────────────────────────
  const [projectForm,         setProjectForm]         = useState(emptyProjectForm);
  const [taskForm,            setTaskForm]            = useState(emptyTaskForm);
  // projectMemberDrafts: { [projectId]: userId[] }
  // Tracks in-progress checkbox selections for each project's member editor.
  const [projectMemberDrafts, setProjectMemberDrafts] = useState({});
  const [taskStatusFilter,    setTaskStatusFilter]    = useState("all");

  // ── Loading / error state ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(false); // true while fetching data
  const [saving,  setSaving]  = useState(false); // true while a form is submitting
  const [error,   setError]   = useState("");

  // ─── Derived State (useMemo) ───────────────────────────────────────────────
  // These values are computed from existing state. useMemo re-computes them only
  // when their dependencies change, avoiding unnecessary recalculation.

  /** Users who have the "member" role — used to populate member pickers. */
  const memberUsers = useMemo(
    () => users.filter((item) => item.role === "member"),
    [users]
  );

  /** The project object that matches the project id currently selected in the task form. */
  const selectedProject = useMemo(
    () => projects.find((project) => project._id === taskForm.project),
    [projects, taskForm.project]
  );

  /**
   * Who can be assigned the new task.
   * If a project is selected and it has members, only those members appear.
   * Otherwise fall back to all members.
   */
  const eligibleAssignees = selectedProject?.members?.length
    ? selectedProject.members
    : memberUsers;

  /** Tasks filtered by the status tabs ("all" | "todo" | "in-progress" | "done"). */
  const filteredTasks = useMemo(() => {
    if (taskStatusFilter === "all") return tasks;
    return tasks.filter((task) => task.status === taskStatusFilter);
  }, [tasks, taskStatusFilter]);

  /** Percentage of tasks marked "done" — used by the progress bar. */
  const completionPercent = dashboard?.totalTasks
    ? Math.round((dashboard.status.done / dashboard.totalTasks) * 100)
    : 0;

  // ─── Data Loading ─────────────────────────────────────────────────────────
  /**
   * Fetches all data needed for the app in parallel.
   * `activeToken` defaults to the current token state but can be passed
   * immediately after login (before the state update has propagated).
   */
  const loadData = async (activeToken = token) => {
    if (!activeToken) return;

    setLoading(true);
    setError("");

    try {
      // Run all API calls simultaneously for speed.
      const [meData, dashboardData, projectData, taskData, userData] = await Promise.all([
        apiRequest("/api/auth/me",          { token: activeToken }),
        apiRequest("/api/dashboard/summary", { token: activeToken }),
        apiRequest("/api/projects",          { token: activeToken }),
        apiRequest("/api/tasks",             { token: activeToken }),
        apiRequest("/api/users/team",        { token: activeToken })
      ]);

      setUser(meData.user);
      setDashboard(dashboardData.summary);
      setProjects(projectData.projects);
      setTasks(taskData.tasks);
      setUsers(userData.users);

      // Build the initial member draft state so each project's checkboxes start
      // with the current member list pre-selected.
      setProjectMemberDrafts(
        Object.fromEntries(
          projectData.projects.map((project) => [
            project._id,
            (project.members || []).map((member) => member._id)
          ])
        )
      );
    } catch (loadError) {
      if (getErrorMessage(loadError).toLowerCase().includes("token")) {
        // Token was rejected by the server — log out and clear local state.
        handleLogout();
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  };

  // Load data whenever the token changes (including on initial mount if already logged in).
  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token]);

  // ─── Session Helpers ───────────────────────────────────────────────────────
  /** Called after successful login/signup. Saves the token and updates state. */
  const setSession = (data) => {
    storage.set("ttm_token", data.token); // persist so the user stays logged in after refresh
    setToken(data.token);
    setUser(data.user);
    setAuthForm(emptyAuthForm); // clear the form
  };

  /** Clears all state and removes the token from localStorage. */
  const handleLogout = () => {
    storage.remove("ttm_token");
    setToken(null);
    setUser(null);
    setDashboard(null);
    setProjects([]);
    setTasks([]);
    setUsers([]);
    setView("dashboard");
  };

  // ─── Event Handlers ───────────────────────────────────────────────────────

  /** Handles login and signup form submission. */
  const handleAuthSubmit = async (event) => {
    event.preventDefault(); // prevent the default HTML form navigation
    setSaving(true);
    setError("");

    try {
      // Send only email+password for login; send the full form for signup.
      const body = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : authForm;

      const data = await apiRequest(`/api/auth/${authMode}`, { method: "POST", body });
      setSession(data);
    } catch (authError) {
      setError(getErrorMessage(authError));
    } finally {
      setSaving(false);
    }
  };

  /** Toggles a member's inclusion in the new-project form checkbox list. */
  const toggleProjectMember = (userId) => {
    setProjectForm((current) => {
      const hasMember = current.memberIds.includes(userId);
      return {
        ...current,
        memberIds: hasMember
          ? current.memberIds.filter((id) => id !== userId) // remove
          : [...current.memberIds, userId]                  // add
      };
    });
  };

  /** Toggles a member in an existing project's inline member editor. */
  const toggleDraftMember = (projectId, userId) => {
    setProjectMemberDrafts((current) => {
      const selected  = current[projectId] || [];
      const hasMember = selected.includes(userId);
      return {
        ...current,
        [projectId]: hasMember
          ? selected.filter((id) => id !== userId)
          : [...selected, userId]
      };
    });
  };

  /** Submits the new-project form. */
  const handleCreateProject = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiRequest("/api/projects", { method: "POST", token, body: projectForm });
      setProjectForm(emptyProjectForm); // reset the form
      await loadData();                  // refresh the project list
    } catch (projectError) {
      setError(getErrorMessage(projectError));
    } finally {
      setSaving(false);
    }
  };

  /** Saves the member list for an existing project. */
  const handleSaveMembers = async (projectId) => {
    setSaving(true);
    setError("");

    try {
      await apiRequest(`/api/projects/${projectId}/members`, {
        method: "PATCH",
        token,
        body: { memberIds: projectMemberDrafts[projectId] || [] }
      });
      await loadData();
    } catch (memberError) {
      setError(getErrorMessage(memberError));
    } finally {
      setSaving(false);
    }
  };

  /** Deletes a project (and all its tasks, handled server-side). */
  const handleDeleteProject = async (projectId) => {
    setSaving(true);
    setError("");

    try {
      await apiRequest(`/api/projects/${projectId}`, { method: "DELETE", token });
      await loadData();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  /** Submits the new-task form. */
  const handleCreateTask = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await apiRequest("/api/tasks", { method: "POST", token, body: taskForm });
      setTaskForm(emptyTaskForm);
      await loadData();
    } catch (taskError) {
      setError(getErrorMessage(taskError));
    } finally {
      setSaving(false);
    }
  };

  /** Updates the status of a task (called by the per-card status dropdown). */
  const handleTaskStatus = async (taskId, status) => {
    setSaving(true);
    setError("");

    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: "PATCH", token, body: { status } });
      await loadData();
    } catch (statusError) {
      setError(getErrorMessage(statusError));
    } finally {
      setSaving(false);
    }
  };

  /** Deletes a task. */
  const handleDeleteTask = async (taskId) => {
    setSaving(true);
    setError("");

    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE", token });
      await loadData();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  // ─── Render: Not logged in ─────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Team Task Manager</p>
            <h1>{authMode === "login" ? "Welcome back" : "Create your workspace access"}</h1>
          </div>

          {/* Login / Signup tab switcher */}
          <div className="segmented" aria-label="Authentication mode">
            <button
              className={authMode === "login" ? "active" : ""}
              type="button"
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              type="button"
              onClick={() => setAuthMode("signup")}
            >
              Signup
            </button>
          </div>

          {/* Error banner */}
          {error ? <div className="alert">{error}</div> : null}

          {/* Auth form — fields change depending on authMode */}
          <form className="stack" onSubmit={handleAuthSubmit}>
            {/* Name field — signup only */}
            {authMode === "signup" ? (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  minLength={2}
                  required
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                type="text"
                inputMode="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                minLength={6}
                required
              />
            </label>

            {/* Role picker — signup only */}
            {authMode === "signup" ? (
              <label>
                Role
                <select
                  value={authForm.role}
                  onChange={(event) => setAuthForm({ ...authForm, role: event.target.value })}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            ) : null}

            <button className="primary-button" disabled={saving} type="submit">
              <CheckCircle2 size={18} />
              {saving ? "Please wait" : authMode === "login" ? "Login" : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  // ─── Render: Logged in ─────────────────────────────────────────────────────
  return (
    <main className="app-shell">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="brand">
          <FolderKanban size={28} />
          <div>
            <strong>Team Task Manager</strong>
            <span>{user.role}</span>
          </div>
        </div>

        {/* Navigation buttons — clicking sets the active view */}
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.key ? "active" : ""}
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <section className="main-content">
        {/* Top bar: breadcrumb, refresh, user name, logout */}
        <header className="topbar">
          <div>
            <p className="eyebrow">{view}</p>
            <h1>{navItems.find((item) => item.key === view)?.label}</h1>
          </div>
          <div className="user-actions">
            <button className="ghost-button" disabled={loading} type="button" onClick={() => loadData()}>
              <RefreshCw size={17} />
              Refresh
            </button>
            <span>{user.name}</span>
            <button className="icon-button" type="button" onClick={handleLogout} title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Global error and loading banners */}
        {error   ? <div className="alert">{error}</div>            : null}
        {loading ? <div className="loading">Loading workspace...</div> : null}

        {/* Render the active view */}
        {view === "dashboard" ? (
          <Dashboard dashboard={dashboard} completionPercent={completionPercent} />
        ) : null}

        {view === "projects" ? (
          <ProjectsView
            user={user}
            projects={projects}
            memberUsers={memberUsers}
            projectForm={projectForm}
            projectMemberDrafts={projectMemberDrafts}
            saving={saving}
            onFormChange={setProjectForm}
            onToggleProjectMember={toggleProjectMember}
            onToggleDraftMember={toggleDraftMember}
            onCreateProject={handleCreateProject}
            onSaveMembers={handleSaveMembers}
            onDeleteProject={handleDeleteProject}
          />
        ) : null}

        {view === "tasks" ? (
          <TasksView
            user={user}
            projects={projects}
            tasks={filteredTasks}
            taskForm={taskForm}
            taskStatusFilter={taskStatusFilter}
            eligibleAssignees={eligibleAssignees}
            saving={saving}
            onFilterChange={setTaskStatusFilter}
            onFormChange={setTaskForm}
            onCreateTask={handleCreateTask}
            onTaskStatus={handleTaskStatus}
            onDeleteTask={handleDeleteTask}
          />
        ) : null}

        {view === "team" ? <TeamView users={users} projects={projects} /> : null}
      </section>
    </main>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────
// These live in the same file to keep the app simple (no need for separate
// component files until the app grows larger).

/**
 * Dashboard — Shows key stats and upcoming / overdue task lists.
 * Returns null while data is still loading (dashboard prop is null).
 */
function Dashboard({ dashboard, completionPercent }) {
  if (!dashboard) return null;

  const statCards = [
    { label: "Projects", value: dashboard.projectCount,  icon: FolderKanban },
    { label: "Tasks",    value: dashboard.totalTasks,    icon: ListTodo },
    { label: "Done",     value: dashboard.status.done,   icon: CheckCircle2 },
    { label: "Overdue",  value: dashboard.overdueTasks,  icon: AlertTriangle }
  ];

  return (
    <div className="page-grid">
      {/* Stat cards row */}
      <section className="stats-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="stat-card" key={card.label}>
              <Icon size={21} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          );
        })}
      </section>

      {/* Progress bar panel */}
      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <h2>Progress</h2>
            <p>{completionPercent}% complete</p>
          </div>
          <strong>{dashboard.status.done}/{dashboard.totalTasks}</strong>
        </div>
        <div className="progress-track">
          {/* Width is set inline so it can be a dynamic percentage */}
          <span style={{ width: `${completionPercent}%` }} />
        </div>
        <div className="status-row">
          <span>Todo: {dashboard.status.todo}</span>
          <span>In progress: {dashboard.status.inProgress}</span>
          <span>Done: {dashboard.status.done}</span>
        </div>
      </section>

      {/* Task preview panels — reuse the same component for both lists */}
      <TaskPreview title="Due Soon" icon={CalendarClock} tasks={dashboard.dueSoonTasks} />
      <TaskPreview title="Overdue"  icon={AlertTriangle} tasks={dashboard.overdueList} danger />
    </div>
  );
}

/**
 * TaskPreview — A compact list of tasks used in the dashboard.
 * @param {string}   title   - Panel heading.
 * @param {Component} icon   - Lucide icon component.
 * @param {Array}    tasks   - Array of task objects.
 * @param {boolean}  danger  - If true, the icon is styled in red.
 */
function TaskPreview({ title, icon: Icon, tasks, danger = false }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <Icon size={20} className={danger ? "danger-icon" : ""} />
      </div>
      <div className="list-stack">
        {tasks?.length ? (
          tasks.map((task) => (
            <article className="mini-row" key={task._id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.project?.name || "Project"} - {task.assignedTo?.name || "Member"}</span>
              </div>
              <time>{formatDate(task.dueDate)}</time>
            </article>
          ))
        ) : (
          <p className="empty-state">Nothing here</p>
        )}
      </div>
    </section>
  );
}

/**
 * ProjectsView — Create new projects and manage existing ones.
 * The create form and member editor are only shown to admins.
 */
function ProjectsView({
  user,
  projects,
  memberUsers,
  projectForm,
  projectMemberDrafts,
  saving,
  onFormChange,
  onToggleProjectMember,
  onToggleDraftMember,
  onCreateProject,
  onSaveMembers,
  onDeleteProject
}) {
  return (
    <div className="content-grid">
      {/* Create project form — admin only */}
      {user.role === "admin" ? (
        <form className="panel form-panel" onSubmit={onCreateProject}>
          <div className="panel-header">
            <h2>New Project</h2>
            <Plus size={19} />
          </div>
          <label>
            Name
            <input
              value={projectForm.name}
              onChange={(event) => onFormChange({ ...projectForm, name: event.target.value })}
              minLength={2}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={projectForm.description}
              onChange={(event) => onFormChange({ ...projectForm, description: event.target.value })}
              rows={4}
            />
          </label>
          {/* Member selection checkboxes */}
          <div className="checkbox-group">
            <span>Members</span>
            {memberUsers.map((member) => (
              <label className="check-row" key={member._id}>
                <input
                  type="checkbox"
                  checked={projectForm.memberIds.includes(member._id)}
                  onChange={() => onToggleProjectMember(member._id)}
                />
                {member.name}
              </label>
            ))}
          </div>
          <button className="primary-button" disabled={saving} type="submit">
            <Plus size={18} />
            Create project
          </button>
        </form>
      ) : null}

      {/* Project list */}
      <section className="panel list-panel">
        <div className="panel-header">
          <h2>Projects</h2>
          <span>{projects.length}</span>
        </div>
        <div className="card-list">
          {projects.length ? (
            projects.map((project) => (
              <article className="entity-card" key={project._id}>
                <div className="entity-header">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.description || "No description"}</p>
                  </div>
                  {/* Delete button — admin only */}
                  {user.role === "admin" ? (
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Delete project"
                      onClick={() => onDeleteProject(project._id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : null}
                </div>
                <div className="meta-row">
                  <span>Owner: {project.owner?.name}</span>
                  <span>{project.members?.length || 0} members</span>
                </div>
                {/* Inline member editor — admin only */}
                {user.role === "admin" ? (
                  <div className="member-editor">
                    {memberUsers.map((member) => (
                      <label className="check-row compact" key={member._id}>
                        <input
                          type="checkbox"
                          checked={(projectMemberDrafts[project._id] || []).includes(member._id)}
                          onChange={() => onToggleDraftMember(project._id, member._id)}
                        />
                        {member.name}
                      </label>
                    ))}
                    <button
                      className="ghost-button"
                      disabled={saving}
                      type="button"
                      onClick={() => onSaveMembers(project._id)}
                    >
                      <UserPlus size={16} />
                      Save members
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="empty-state">No projects yet</p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * TasksView — Create tasks and view/filter the task list.
 * Admins see the create form; both roles see the task cards.
 * Members can change task status; admins can also delete tasks.
 */
function TasksView({
  user,
  projects,
  tasks,
  taskForm,
  taskStatusFilter,
  eligibleAssignees,
  saving,
  onFilterChange,
  onFormChange,
  onCreateTask,
  onTaskStatus,
  onDeleteTask
}) {
  return (
    <div className="content-grid">
      {/* Create task form — admin only */}
      {user.role === "admin" ? (
        <form className="panel form-panel" onSubmit={onCreateTask}>
          <div className="panel-header">
            <h2>New Task</h2>
            <Plus size={19} />
          </div>
          <label>
            Title
            <input
              value={taskForm.title}
              onChange={(event) => onFormChange({ ...taskForm, title: event.target.value })}
              minLength={2}
              required
            />
          </label>
          <label>
            Project
            <select
              value={taskForm.project}
              onChange={(event) =>
                // Reset assignedTo when the project changes (the eligible assignee list changes too).
                onFormChange({ ...taskForm, project: event.target.value, assignedTo: "" })
              }
              required
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select
              value={taskForm.assignedTo}
              onChange={(event) => onFormChange({ ...taskForm, assignedTo: event.target.value })}
              required
            >
              <option value="">Select member</option>
              {eligibleAssignees.map((member) => (
                <option key={member._id} value={member._id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="two-col">
            <label>
              Priority
              <select
                value={taskForm.priority}
                onChange={(event) => onFormChange({ ...taskForm, priority: event.target.value })}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(event) => onFormChange({ ...taskForm, dueDate: event.target.value })}
                required
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              value={taskForm.description}
              onChange={(event) => onFormChange({ ...taskForm, description: event.target.value })}
              rows={4}
            />
          </label>
          <button className="primary-button" disabled={saving} type="submit">
            <Plus size={18} />
            Create task
          </button>
        </form>
      ) : null}

      {/* Task list */}
      <section className="panel list-panel">
        {/* Status filter tabs */}
        <div className="panel-header wrap">
          <h2>Tasks</h2>
          <div className="segmented compact-segmented">
            {["all", "todo", "in-progress", "done"].map((status) => (
              <button
                className={taskStatusFilter === status ? "active" : ""}
                key={status}
                type="button"
                onClick={() => onFilterChange(status)}
              >
                {status === "all" ? "All" : statusLabels[status]}
              </button>
            ))}
          </div>
        </div>

        <div className="card-list">
          {tasks.length ? (
            tasks.map((task) => (
              // Add "overdue" class to visually flag tasks past their deadline.
              <article
                className={`entity-card task-card ${isOverdue(task) ? "overdue" : ""}`}
                key={task._id}
              >
                <div className="entity-header">
                  <div>
                    <h3>{task.title}</h3>
                    <p>{task.description || "No description"}</p>
                  </div>
                  {/* Delete button — admin only */}
                  {user.role === "admin" ? (
                    <button
                      className="icon-button danger"
                      type="button"
                      title="Delete task"
                      onClick={() => onDeleteTask(task._id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  ) : null}
                </div>
                {/* Task metadata row */}
                <div className="meta-row">
                  <span>{task.project?.name  || "Project"}</span>
                  <span>{task.assignedTo?.name || "Member"}</span>
                  <span>{formatDate(task.dueDate)}</span>
                </div>
                {/* Footer: priority badge + status dropdown */}
                <div className="task-footer">
                  <span className={`pill priority-${task.priority}`}>
                    {priorityLabels[task.priority]}
                  </span>
                  {/* Status dropdown: both admins and members can change status */}
                  <select
                    value={task.status}
                    onChange={(event) => onTaskStatus(task._id, event.target.value)}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">No tasks here</p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * TeamView — Displays all visible team members as cards.
 * Each card shows the user's name, email, role badge, and project count.
 */
function TeamView({ users, projects }) {
  return (
    <div className="content-grid single">
      <section className="panel list-panel">
        <div className="panel-header">
          <h2>People</h2>
          <span>{users.length}</span>
        </div>
        <div className="people-grid">
          {users.map((person) => {
            // Count how many projects this person is a member of.
            const projectCount = projects.filter((project) =>
              project.members?.some((member) => member._id === person._id)
            ).length;

            return (
              <article className="person-card" key={person._id}>
                {/* Avatar: first letter of name, uppercased */}
                <div className="avatar">{person.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <h3>{person.name}</h3>
                  <p>{person.email}</p>
                </div>
                <span className={`role-badge ${person.role}`}>{person.role}</span>
                <small>
                  {person.role === "member" ? `${projectCount} projects` : "Workspace admin"}
                </small>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
