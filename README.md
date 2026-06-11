# DB Design — Local PostgreSQL Database Design Tool

> English | [简体中文](README.zh-CN.md)

Visually design **PostgreSQL** tables, then export a `.sql` file or execute the DDL directly against your local database. Project state is persisted to a local `.dbdesign.json` file, or stored as a single JSONB row inside the target database itself (the `__dbdesign` table) so the design travels with the database.

## Features

- Field-table editor with full column attributes (type / length / precision / primary key / unique / default / CHECK / comment / foreign key / soft delete, etc.).
- Custom ENUM types, referenced by `schema.name` in the field-type dropdown.
- Foreign key dialog: pick the referenced table + field and the `ON DELETE` / `ON UPDATE` actions.
- One-click audit fields: pick from timestamps (`created_at` / `updated_at` / `deleted_at`), actors (`created_by` / `updated_by` / `deleted_by`, with a configurable type — BIGINT / INTEGER / UUID — to match your `users` primary key), and optional optimistic-lock `version`, `created_ip` / `updated_ip`, and `tenant_id`. The core six are checked by default; the rest are opt-in.
- Relationship diagram (React Flow): field-level handles, dagre auto-layout, fullscreen, and persisted viewport / positions.
- SQL preview + copy + `.sql` download.
- Execute DDL directly against the connected PostgreSQL: transactional mode (roll back everything on error) or per-statement mode (continue on error), with per-statement status display.
- Reverse-engineer an existing database into an editable project.
- DB-embedded config: store the entire `ProjectFile` as a single JSONB row in the target database's `__dbdesign` table, with one-click "save to DB" / "load from DB".
- Undo/redo, global keyboard shortcuts, and schema diffing (`ALTER` preview).

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + TypeScript + Vite + Ant Design 5 |
| State | Zustand + zundo (undo/redo) |
| Diagram | @xyflow/react v12 + @dagrejs/dagre |
| Backend | Express + TypeScript + `pg` driver |
| Testing | Vitest |

## Requirements

- Node.js ≥ 18 (LTS recommended).
- npm ≥ 9 (workspaces enabled).
- A local or reachable PostgreSQL ≥ 12 (only needed for "test connection / execute DDL / save to DB / import").
- A browser supporting the File System Access API (to save/open `.dbdesign.json`) — Chrome / Edge are supported; Safari / Firefox fall back to download.

## Getting Started

```bash
# Install root + all workspace dependencies (npm workspaces)
npm install

# Start frontend and backend together
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001 (health check at `/api/health`)
- Vite proxies `/api/*` to `localhost:3001`, so no manual CORS setup is required.

You can also run them separately:

```bash
npm run dev:fe   # Frontend (Vite)
npm run dev:be   # Backend (ts-node-dev)
```

## Common Scripts

```bash
npm run build                              # Build frontend → packages/frontend/dist
npm run test                               # Run frontend Vitest tests

# A single test file
npm run test --workspace=packages/frontend -- --run sqlGenerator
```

Build the backend separately:

```bash
npm --workspace=packages/backend run build  # tsc → dist/
npm --workspace=packages/backend run start  # node dist/index.js
```

## Configuration

The backend defaults to port 3001 and allows CORS from `http://localhost:5173`. To customize, add a `.env` file under `packages/backend/`:

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Database credentials are **never** persisted on the server: every `/api/*` request carries its own connection info, and the backend creates a pool → executes → calls `pool.end()` immediately. The frontend keeps the connection config (including the password) in `sessionStorage`, which is cleared when the browser tab closes.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + S` | Save the current project to `.dbdesign.json` |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Undo / redo (zundo) |
| `Delete` | Delete the selected table (with confirmation) |
| `Escape` | Close the current modal / cancel cell editing |

While editing in a table or input, global shortcuts automatically defer to inline editing.

## Project Structure

```
docs/                  Plans and tutorials (incl. guideline/diagram-view.md)
packages/
  backend/             Express, port 3001
    src/routes/        connection / schema / project
    src/services/      pgClient · schemaInspector · configStore · schemaDiff
  frontend/            React + Vite, port 5173
    src/components/    layout · sidebar · editor · diagram · sql · connection
    src/store/         projectStore (zundo) · uiStore · connectionStore
    src/utils/         sqlGenerator · schemaImporter · layoutEngine
```

## Documentation

- Usage guide: [`docs/guideline/usage.md`](docs/guideline/usage.md)
- Diagram view tutorial: [`docs/guideline/diagram-view.md`](docs/guideline/diagram-view.md)
- Detailed development plan: [`docs/plan/development-plan-20260527.md`](docs/plan/development-plan-20260527.md)

## License

MIT — see [`LICENSE`](LICENSE).
