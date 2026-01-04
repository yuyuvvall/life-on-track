# The Auditor

A high-density productivity engine built with React + TypeScript + SQLite.

## Features

- **Atomic Tasks**: Parent-child task relationships with automatic completion tracking
- **Work Integrity**: Daily binary logging with forced retrospective on missed opportunities
- **Financial Velocity**: Quick-add expenses with minimal friction
- **Weekly Engine**: Aggregated reflection view with auto-populated notes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React PWA (Client)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Pulse Dash   │  │ Closing View │  │ Quick Add    │       │
│  │ (Mobile)     │  │ (Desktop)    │  │ Modal        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express API Server                         │
│  /api/tasks  /api/work-logs  /api/expenses  /api/goals      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      SQLite Database                         │
│  tasks | subtasks | work_logs | expenses | goals            │
└─────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

The app will be available at:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001

### Build for Production

```bash
npm run build
npm start
```

## Usage

### Mobile "Pulse" View

- **Tap** the + button to add an expense
- **Long press** the + button to add a task
- **Swipe right** on a task to mark it complete
- Tasks with subtasks can only be completed when all subtasks are done

### Weekly "Closing Event" View

- Access via the "Weekly →" link in the header
- Left pane shows spending breakdown, integrity heatmap, and goal progress
- Right pane provides a markdown editor for weekly reflection
- Missed opportunity notes are auto-populated

### Work Integrity

- Log a binary score (1 or 0) daily
- Score of 0 requires a retrospective note explaining the missed opportunity
- Auto-prompted after 6 PM if not logged

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| State | TanStack Query, Zustand |
| PWA | Vite PWA Plugin |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Gestures | react-swipeable |

## Project Structure

```
life-on-track/
├── client/                 # React PWA
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # UI components
│   │   ├── hooks/         # React Query hooks
│   │   ├── store/         # Zustand store
│   │   ├── types/         # TypeScript types
│   │   └── views/         # Page components
│   └── public/            # Static assets
├── server/                 # Express API
│   └── src/
│       ├── db/            # Database setup
│       └── routes/        # API routes
└── package.json           # Monorepo root
```

## License

MIT
