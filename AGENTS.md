# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A local PostgreSQL database design tool. Users visually design tables and fields, then either export a `.sql` file or execute DDL directly against a local PostgreSQL instance. Project state is persisted as `.dbdesign.json` files via the browser File API.

## Commands

**Root (monorepo):**
```bash
npm run dev        # Start both frontend (Vite) and backend (Express) concurrently
npm run dev:fe     # Frontend only
npm run dev:be     # Backend only
npm run build      # Build frontend only
npm run test       # Run frontend tests (Vitest)
```

**Backend only (`packages/backend`):**
```bash
npm run dev        # ts-node-dev with hot reload
npm run build      # tsc → dist/
npm run start      # node dist/index.js
```

**Single frontend test:**
```bash
npm run test --workspace=packages/frontend -- --run <test-file-pattern>
```

## Architecture

### Monorepo Structure

```
packages/
  backend/   # Express + TypeScript, port 3001
  frontend/  # React + TypeScript + Vite, proxies /api → localhost:3001
```

The frontend Vite config proxies all `/api` requests to `localhost:3001`, so the backend must be running for any database operations.

### Backend (`packages/backend`)

Three-layer design: **routes → services → pg driver**.

- `src/routes/connection.ts` — `POST /api/connection/test`, `POST /api/connection/inspect`
- `src/routes/schema.ts` — `POST /api/schema/execute`
- `src/services/pgClient.ts` — creates a short-lived `pg.Pool` per request; **credentials are never persisted**. Provides `testConnection`, `executeInTransaction`, and `executeStatements`.
- `src/services/schemaInspector.ts` — reverse-engineers an existing PostgreSQL database using `information_schema` and `pg_catalog` queries; returns tables, columns, foreign keys, indexes, and ENUMs.

`/api/schema/execute` accepts a `transactional` boolean: `true` wraps all statements in a single transaction (roll back on any failure), `false` executes each statement independently and continues on error.

### Frontend (`packages/frontend`)

**State management** (Zustand stores):
- `projectStore` — single source of truth for tables, fields, and ENUMs; wrapped with `zundo` for undo/redo
- `uiStore` — selected table, active view (editor vs diagram), modal visibility
- `connectionStore` — database connection config (in-memory only)

**Data flow:** All components read from and write to Zustand stores. Stores do not call the API directly — that is done via hooks (`useProject`, `useTableEditor`, etc.) or `api/` modules.

**Views:**
1. **Editor view** — left sidebar table list + right field editor (`Ant Design Table` with inline editing)
2. **Diagram view** — `@xyflow/react` (React Flow) with custom `TableNode` components; each field row has its own `Handle` so foreign key edges connect at the field level, not just the table level

**SQL generation** (`utils/sqlGenerator.ts`) runs entirely in the browser. It topologically sorts tables by foreign key dependency before emitting DDL. The same `generateProjectDdl(project)` output is used for both the SQL preview modal and the payload sent to `POST /api/schema/execute`.

**DDL execution order** (enforced by both `sqlGenerator.ts` and `ddlExecutor.ts`):
1. `CREATE TYPE` (ENUMs — no dependencies)
2. `CREATE TABLE` (topological sort; referenced tables first)
3. `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` (after all tables exist)
4. `CREATE INDEX`
5. `COMMENT ON TABLE / COLUMN`

### Core Data Model

Defined in `packages/frontend/src/types/schema.ts`. The root type is `ProjectFile` (saved as `.dbdesign.json`). Key relationships:

- `ProjectFile` has `tables: TableDefinition[]` and `enums: EnumType[]`
- `FieldDefinition.type` is `'USER-DEFINED'` when referencing a custom ENUM; `enumTypeId` links to `EnumType.id`
- `FieldDefinition.foreignKey` holds `referenceTableId` / `referenceFieldId` (IDs, not names) plus `onDelete`/`onUpdate` actions
- `TableDefinition.position` stores the React Flow canvas position and is persisted to the JSON file

### Diagram Layout

`utils/layoutEngine.ts` wraps `@dagrejs/dagre` to auto-arrange nodes. The "auto layout" button recomputes positions and writes them back to `projectStore`, which then persists to the JSON file on next save.

## Key Design Decisions

- **No ORM** — raw `pg` driver for precise DDL control
- **Stateless backend** — connection credentials live only in the request body; the server holds no session state
- **Browser File API** for project persistence — no server-side storage needed
- **Field-level React Flow Handles** — each `FieldDefinition` row registers its own `sourceHandle`/`targetHandle` (keyed by `fieldId`) so FK edges appear at the correct row in the diagram
