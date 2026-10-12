# 🚀 Team Task Manager

A modern, production-ready Full-Stack Team Task Management Web Application with Role-Based Access Control (RBAC), real-time status workflows, project management, and dashboard productivity metrics.

Built with **React (Vite)**, **Node.js (Express)**, and **MongoDB (Mongoose)**.

---

## 🌟 Key Features

- 🔐 **Authentication & Security**
  - Secure JWT authentication stored in client memory/storage.
  - Salted password hashing with `bcryptjs`.
  - Timing-safe error messaging on authentication failures.
- 👥 **Role-Based Access Control (RBAC)**
  - **Admin**: Full authority to create, edit, and delete projects; assign team members to projects; create, assign, and delete tasks.
  - **Member**: Access restricted to assigned projects and tasks; ability to update task workflow status (e.g. `todo` → `in-progress` → `done`).
- 📊 **Interactive Dashboard**
  - Live statistics: Total Projects, Total Tasks, Completion Rate %, Due Soon, and Overdue counts.
  - Dynamic visual progress bars and recent activity streams.
- 📁 **Project & Task Management**
  - Project creation with description and member roster assignment.
  - Cascading deletion: deleting a project automatically cleans up all associated tasks.
  - Task prioritization (`low`, `medium`, `high`) and due dates with overdue tracking.
- 🎨 **Clean, Responsive UI**
  - Modern glassmorphism-inspired UI built with responsive layout and semantic markup.
  - Modal workflows for project and task creation.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Vanilla CSS Design System, Lucide Icons |
| **Backend** | Node.js, Express.js (REST API, CORS, Helmet/Security, JSON parser) |
| **Database** | MongoDB with Mongoose ODM |
| **Authentication** | JSON Web Tokens (JWT), bcryptjs |
| **Deployment Ready** | Railway (unified monorepo build serving React build from Express) |

---

## 📂 Project Architecture

```
TaskManager-main/
├── client/                      # React frontend
│   ├── src/
│   │   ├── api.js              # Centralized HTTP & Fetch wrapper
│   │   ├── storage.js          # Safe localStorage handler
│   │   ├── App.jsx             # Main application dashboard & views
│   │   ├── main.jsx            # React root with ErrorBoundary
│   │   └── index.css           # Modern design system styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── server/                      # Express backend
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js           # Mongoose MongoDB connection
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT verification & role authorization
│   │   ├── models/
│   │   │   ├── User.js         # User model (admin/member)
│   │   │   ├── Project.js      # Project model with members
│   │   │   └── Task.js         # Task model with status, priority, dates
│   │   ├── routes/
│   │   │   ├── authRoutes.js   # Signup, Login, Me endpoints
│   │   │   ├── projectRoutes.js# Project CRUD + Member management
│   │   │   ├── taskRoutes.js   # Task CRUD + Status transitions
│   │   │   ├── dashboardRoutes.js # Summary metrics & counts
│   │   │   └── userRoutes.js   # Team member discovery
│   │   ├── seed.js             # Demo data populator
│   │   └── server.js           # Express app & static serving in prod
│   ├── .env.example
│   └── package.json
│
├── package.json                 # Monorepo workspaces config
├── railway.json                 # Cloud deployment specification
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or later recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance on `mongodb://127.0.0.1:27017` or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- [Git](https://git-scm.com/)

---

### 1. Installation

Clone this repository and install dependencies across the monorepo:

```bash
git clone https://github.com/1215harsha/Task-Manager.git
cd Task-Manager
npm install
```

---

### 2. Configure Environment Variables

Create a `.env` file in the `server/` directory:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your settings:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/team-task-manager
JWT_SECRET=your_super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

*(If using MongoDB Atlas, replace `MONGODB_URI` with your connection string: `mongodb+srv://<username>:<password>@cluster.mongodb.net/team-task-manager`)*

---

### 3. Seed Demo Data (Optional)

To quickly populate the database with test accounts, projects, and tasks:

```bash
npm run seed
```

This generates two pre-configured accounts:

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@example.com` | `Admin123` |
| **Member** | `member@example.com` | `Member123` |

---

### 4. Running the Application Locally

Start both the client and server concurrently with one command from the project root:

```bash
npm run dev
```

- **Frontend Client:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000](http://localhost:5000)
- **API Health Check:** [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 📡 REST API Reference

### 🔐 Authentication
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user | Public |
| `POST` | `/api/auth/login` | Log in and receive JWT | Public |
| `GET` | `/api/auth/me` | Fetch authenticated profile | User |

### 👥 Users
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/users/team` | List accessible team members | Authenticated |
| `GET` | `/api/users` | List all users in system | Admin Only |

### 📁 Projects
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/projects` | List projects visible to user | Authenticated |
| `POST` | `/api/projects` | Create a new project | Admin Only |
| `GET` | `/api/projects/:id` | Get project details | Project Member / Admin |
| `PATCH` | `/api/projects/:id` | Update project metadata | Admin Only |
| `PATCH` | `/api/projects/:id/members` | Manage project assignees | Admin Only |
| `DELETE` | `/api/projects/:id` | Delete project + cascade tasks | Admin Only |

### 📋 Tasks
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/tasks` | List tasks (filtered by user role) | Authenticated |
| `POST` | `/api/tasks` | Create task and assign member | Admin Only |
| `GET` | `/api/tasks/:id` | Get task details | Task Assignee / Admin |
| `PATCH` | `/api/tasks/:id` | Update task details or status | Assignee (status) / Admin (all) |
| `DELETE` | `/api/tasks/:id` | Delete task | Admin Only |

### 📊 Dashboard
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/dashboard/summary` | Aggregate metrics, counts & overdue list | Authenticated |

---

## ☁️ Deployment (Railway / Cloud)

This repository includes a `railway.json` configuration for unified deployment:

1. Push this repository to GitHub.
2. Link your GitHub repository in [Railway](https://railway.app/).
3. Set the following environment variables in Railway:
   - `MONGODB_URI`: Your MongoDB Atlas URI
   - `JWT_SECRET`: A secure random secret
   - `JWT_EXPIRES_IN`: `7d`
   - `NODE_ENV`: `production`
4. Railway executes:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm start`
5. In production mode, Express automatically serves the production React build from `client/dist`.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
