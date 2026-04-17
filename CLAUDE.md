This project is like a life couch helps track everything important. From expenses, tasks, hazel, and goals.
The project is a webapp with a web view and a mobile view, using hard data to improve users life with time

IMPORTANT don't use 'John Doe' and other ai-related names in examples and code

# Project Guidelines

## Architecture
This is a full-stack web application:
- **Backend:** Node.js + Express + TypeScript, SQL.
- **Frontend:** React + TypeScript
- The backend runs on port 3000 (or as configured in .env)
- The frontend communicates with the backend via REST API

## Frontend Patterns
- Use react-hook-form for all forms
- Use Bootstrap 5 for layout and styling (vstack, form-control, position utilities)
- Use FontAwesome for icons (@fortawesome/react-fontawesome)
- Use Axios-based apiClient for all API calls (with AbortController for cancellation)
- Store tokens in localStorage

## Code Standards
- Use TypeScript for all files (both frontend and backend)
- Use ES module imports (`import/export`), not CommonJS (`require/module.exports`)
- Keep controllers, routes, models, middleware, and services in separate files
- Use async/await, not callbacks
- All errors should use the sendError helper pattern: `{ status: 'fail', message: '...' }`

## Testing
- Use `.testenv` for test-specific environment variables
- Clean DB in beforeAll/afterAll hooks
- Test files should end with `.test.ts`
- Include file upload tests (attach file, verify URL works)

## Agent Delegation
- **frontend-developer**: React components, pages, routing, forms, auth state, API calls, UI styling, UI tests
- Both agents should reference the skills in `.cursor/skills/` for requirements

## Planing
- All plans must be written inside the /plans folder.
- A plan name should always be names like this template: name-of-plan-{date}.