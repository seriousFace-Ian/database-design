# 数据表设计系统 — 详细开发计划

## Context

基于 `docs/plan/init.md` 需求文档，构建一个面向 PostgreSQL 的本地数据表设计工具。用户已确认：
- **UI 模式**：左侧表列表 + 右侧字段表单编辑器
- **数据库连接**：同时支持直连执行 DDL + 导出 SQL 文件
- **数据持久化**：保存为本地 JSON 项目文件（可导入/导出）
- **字段类型**：常用 PostgreSQL 类型 + 自定义 ENUM 枚举类型

## 需求
- 快速设计数据表（涵盖基本功能）
  - 类型定义
  - 枚举值设置
  - 约束设置（CONSTRAINT）
    - PRIMARY KEY（唯一索引）
    - FOREIGN KEY（可以设置跨表完整性引用）
    - Unique（唯一约束，单列通过字段勾选）
    - CHECK（自定义布尔表达式）
    - NOT NULL 非空设置
    - EXCLUDE 排斥约束
  - 索引设置（INDEX） 
- 导出 json 格式配置
- 连接本地环境数据库，支持根据设计表生成 SQL 创建表
- 支持将数据保存到测试数据库（ 连接 __dbdesign， 支持存取）

---

## 技术选型

| 层级 | 选型 | 原因 |
|------|------|------|
| 前端框架 | React + TypeScript + Vite | 需求指定 |
| UI 组件 | Ant Design 5 | 需求指定 |
| 状态管理 | Zustand + zundo（撤销） | 轻量、TypeScript 友好、易持久化 |
| 关系图 | @xyflow/react（React Flow） | React 原生、字段级 Handle 支持 |
| 自动布局 | @dagrejs/dagre | 有向图布局，与 React Flow 配套 |
| 字段排序 | @dnd-kit | 无障碍拖拽排序 |
| 后端框架 | Express + TypeScript | 轻量，配合 pg 驱动 |
| PG 驱动 | pg（node-postgres） | 精确控制 DDL，无 ORM 层 |

---

## 项目结构

```
database-design/
├── docs/plan/init.md
├── package.json                         # monorepo root (npm workspaces + concurrently)
├── README.md
└── packages/
    ├── frontend/
    │   ├── vite.config.ts               # 代理 /api → localhost:3001
    │   └── src/
    │       ├── types/
    │       │   ├── schema.ts            # 核心数据模型（见下方）
    │       │   ├── api.ts               # 后端请求/响应类型
    │       │   └── flow.ts              # React Flow 节点/边类型
    │       ├── store/
    │       │   ├── projectStore.ts      # 表/字段/ENUM 主数据
    │       │   ├── uiStore.ts           # 选中状态、视图切换
    │       │   └── connectionStore.ts   # 数据库连接配置
    │       ├── api/
    │       │   ├── client.ts            # axios 实例
    │       │   ├── connection.ts        # 连接测试/Schema 读取
    │       │   └── schema.ts            # DDL 执行
    │       ├── components/
    │       │   ├── layout/              # AppLayout, Sidebar, Toolbar
    │       │   ├── sidebar/             # TableList, AddTableModal
    │       │   ├── editor/              # TableEditor, FieldsTable, FieldTypeSelect,
    │       │   │                        # ConstraintConfig, EnumEditor, ForeignKeyModal
    │       │   ├── diagram/             # DiagramView, TableNode, ForeignKeyEdge
    │       │   ├── sql/                 # SqlPreviewModal, SqlDiffViewer
    │       │   ├── connection/          # ConnectionPanel, ConnectionStatus
    │       │   └── common/              # EditableCell, ConfirmModal
    │       ├── hooks/
    │       │   ├── useProject.ts        # 项目数据操作
    │       │   ├── useTableEditor.ts    # 字段编辑逻辑
    │       │   ├── useDiagram.ts        # tables → nodes/edges 转换
    │       │   ├── useSqlGenerator.ts   # SQL 生成
    │       │   └── useFileSystem.ts     # JSON 文件读写（File API）
    │       └── utils/
    │           ├── sqlGenerator.ts      # PostgreSQL DDL 生成（含拓扑排序）
    │           ├── typeDefinitions.ts   # PG 字段类型枚举定义
    │           └── layoutEngine.ts      # dagre 自动布局
    └── backend/
        └── src/
            ├── index.ts                 # Express 入口（端口 3001）
            ├── routes/
            │   ├── connection.ts        # /api/connection/*
            │   └── schema.ts            # /api/schema/*
            ├── services/
            │   ├── pgClient.ts          # 动态连接管理（不持久化凭据）
            │   ├── ddlExecutor.ts       # 有序事务性 DDL 执行
            │   └── schemaInspector.ts   # 逆向读取现有数据库结构
            └── middleware/
                └── errorHandler.ts
```

---

## 核心数据模型（`types/schema.ts`）

```typescript
// 项目文件根结构（保存为 .dbdesign.json）
interface ProjectFile {
  $schema: string; 
  version: string;
  name: string; 
  description?: string;
  createdAt: string; 
  updatedAt: string;
  enums: EnumType[];
  tables: TableDefinition[];
  diagramLayout?: { zoom: number; position: { x: number; y: number } };
}

interface TableDefinition {
  id: string; 
  name: string; 
  schema: string; 
  comment?: string;
  fields: FieldDefinition[];
  indexes?: IndexDefinition[];
  position?: { x: number; y: number };  // React Flow 布局位置
  createdAt: string;
  updatedAt: string;
}

interface FieldDefinition {
  id: string; name: string;
  type: PgFieldType;            // 'INTEGER' | 'VARCHAR' | 'USER-DEFINED' | ...
  enumTypeId?: string;          // type=USER-DEFINED 时引用 EnumType.id
  length?: number;
  precision?: number;
  scale?: number;
  isArray?: boolean;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue?: string;        // 原始 SQL 字符串
  checkConstraint?: string;
  foreignKey?: ForeignKeyConfig;
  comment?: string;
  order: number;
}

interface ForeignKeyConfig {
  referenceTableId: string;
  referenceFieldId: string;
  onDelete: FkAction;
  onUpdate: FkAction;
  constraintName?: string;
}

interface EnumType {
  id: string;
  name: string;
  schema: string;
  values: string[]; 
  comment?: string;
}
```

---

## 后端 API 接口

```
POST /api/connection/test      → 测试连接（SELECT version()），返回 PG 版本
POST /api/connection/inspect   → 逆向读取现有 Schema，返回表/列/外键/ENUM
POST /api/schema/execute       → 事务性执行 DDL 语句数组
POST /api/schema/preview-diff  → 对比设计与数据库，生成 ALTER 语句（只读）
```

**DDL 执行顺序**（`ddlExecutor.ts` 强制保证）：
1. `CREATE TYPE`（ENUM，无依赖）
2. `CREATE TABLE`（对表做拓扑排序，被引用表优先）
3. `ALTER TABLE ADD CONSTRAINT FOREIGN KEY`（所有表创建后）
4. `CREATE INDEX`
5. `COMMENT ON TABLE / COLUMN`

---

## 开发阶段

### Phase 1 — 项目骨架（3-4 天）
- 初始化 monorepo（npm workspaces + concurrently）
- 搭建 Express 服务器（含 CORS、错误中间件）
- 搭建 Vite + React + Ant Design 前端
- 实现 `AppLayout`（三栏：sidebar | editor | 工具栏）
- 实现 Zustand store 基础结构
- 实现 JSON 项目文件新建/保存/加载（浏览器 File API）
- **交付**：可启动、可创建空项目、可保存 JSON

### Phase 2 — 字段编辑器（4-5 天）
- `TableList` + `AddTableModal`（新建/删除/重命名表）
- `FieldsTable`（Ant Design Table 内联编辑，字段属性全覆盖）
- `FieldTypeSelect`（类型下拉，分组：整数/文本/数值/日期/布尔/JSON/UUID/ENUM）
- `EnumEditor`（ENUM 类型管理面板，增删值）
- `ForeignKeyModal`（选引用表和字段，配置 ON DELETE/UPDATE）
- 字段拖拽排序（@dnd-kit）
- **交付**：完整字段设计，可保存/加载 JSON

### Phase 3 — SQL 生成（2-3 天）
- `sqlGenerator.ts`（完整 DDL，含 ENUM/外键/索引/注释/拓扑排序）
- `SqlPreviewModal`（语法高亮展示，支持复制和下载 .sql 文件）
- `ConstraintConfig`（CHECK 约束输入）
- `sqlGenerator` 单元测试（Vitest，覆盖 ENUM、复合索引、循环外键等边界情况）
- **交付**：生成可直接执行的 PostgreSQL DDL

### Phase 4 — 数据库直连（3-4 天）
- 后端 `pgClient.ts`（动态连接池，不持久化密码）
- 后端 `ddlExecutor.ts`（有序事务执行）
- 后端 `schemaInspector.ts`（逆向读取数据库，返回 `InspectSchemaResponse`）
- 前端 `ConnectionPanel`（填写连接配置、测试连接、显示连接状态徽标）
- 前端执行 DDL 流程（逐条显示执行结果，失败高亮）
- "从数据库导入"功能（将现有库结构转换为 `ProjectFile`）
- **交付**：可连接本地 PostgreSQL 并创建表

### Phase 5 — 关系图（3-4 天）
- `useDiagram.ts`（`ProjectFile` → React Flow nodes/edges）
- `TableNode`（自定义节点，字段级 Handle，显示 PK/FK/Unique 图标）
- `ForeignKeyEdge`（带箭头，悬停显示约束名和 ON DELETE 动作）
- `DiagramView`（React Flow 容器，支持缩放、平移、全屏）
- dagre 自动布局（"整理布局"按钮）
- 节点位置变化同步回 `projectStore`（保存布局到 JSON）
- **交付**：可交互的外键关系可视化图

### Phase 6 — 打磨（2-3 天）
- `SqlDiffViewer`（设计 vs 数据库现状的 ALTER 语句差异）
- 撤销/重做（zundo Zustand 中间件）
- 键盘快捷键（Ctrl+S 保存、Del 删除、Escape 取消）
- 全局错误处理和用户反馈（连接失败、DDL 错误详情）
- README + 本地启动文档

---

## 关键工具函数复用

- `sqlGenerator.ts` 的 `generateProjectDdl(project)` → SQL 预览 + 后端执行两用
- `schemaInspector.ts` → 逆向导入功能
- `useDiagram.ts` → `DiagramView` 和保存节点位置两用
- Zustand `projectStore` → 所有组件共享单一数据源

---

## 验证方式

1. **单元测试**：`npm run test --workspace=packages/frontend`，验证 SQL 生成器对各类型/约束组合的输出
2. **集成测试**：启动本地 PostgreSQL，通过 `ConnectionPanel` 执行生成的 DDL，使用 `psql` 确认表结构正确
3. **端到端**：创建包含外键关联的多表项目 → 保存为 JSON → 重新加载 → 验证关系图正确显示 → 执行 DDL → 检查数据库

---

## 技术风险

| 风险 | 应对 |
|------|------|
| 外键 DDL 执行顺序 | 拓扑排序 + 分步执行（CREATE TABLE 全部完成后再添加 FK 约束） |
| React Flow 字段级连线 | 每个字段行注册独立 Handle（sourceHandle/targetHandle = fieldId） |
| 大量表时性能 | React Flow 内置虚拟化；nodes/edges 用 `useMemo` 包裹 |
| 连接凭据安全 | 后端不持久化密码，仅在请求生命周期内存于内存 |

---

## Phase 2 扩展 — 数据库内嵌配置存储（`__dbdesign` 配置表）

### 定位

Phase 2 已交付**本地 JSON 文件**（`.dbdesign.json`）持久化。本扩展在此基础上增加**第二种持久化通道**：把整个 `ProjectFile` 以一行 JSONB 存进**目标数据库自身**，使「设计配置」随库走，便于在没有本地文件时直接从库中恢复设计。

- **可接受的约束**：每个独立数据库保留一张配置表，单库单份设计（一行）。
- **依赖**：复用 Phase 4 的后端连接基础设施（`pgClient.createPool`、`connectionStore`、`ConnectionPanel`）。若 Phase 4 尚未完成，需先落地 `pgClient.ts` 与连接配置面板。
- **不改变**：本地 JSON 文件能力保持不变，两种通道并存（文件 = 离线/可版本管理；数据库 = 随库分发）。

### 配置表设计

```sql
-- 主配置表：单库单行，存完整 ProjectFile
CREATE TABLE IF NOT EXISTS __dbdesign (
  id         INT PRIMARY KEY DEFAULT 1,
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT __dbdesign_single_row CHECK (id = 1)   -- 强制只有一行
);
```

- `__` 前缀避免与用户业务表命名冲突；`CHECK (id = 1)` 保证全表至多一行。
- `config` 列存与 `.dbdesign.json` **完全一致**的 `ProjectFile` JSON，零额外映射。
- 写入用 upsert（`ON CONFLICT (id) DO UPDATE`），读取固定 `WHERE id = 1`。

**可选 · 版本历史**（如需保留快照，后续迭代再做）：

```sql
CREATE TABLE IF NOT EXISTS __dbdesign_history (
  id       BIGSERIAL PRIMARY KEY,
  config   JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note     TEXT
);
-- 每次保存主表时附带 INSERT 一行，定期清理仅保留最近 N 条
```

### 数据库初始化机制

建表语句采用 `CREATE TABLE IF NOT EXISTS`，**幂等**，可安全重复执行。初始化有两条触发路径：

1. **显式初始化**：连接成功后，用户点「初始化数据库」按钮 → `POST /api/project/init` → 仅执行建表。
2. **自愈式初始化**（推荐默认）：`saveProjectConfig` 在 upsert 前先跑一次 `CREATE TABLE IF NOT EXISTS`，因此首次「保存到数据库」会自动建表，用户无需关心初始化步骤。

> 首次连接一个全新库的引导顺序：**测试连接 → 保存到数据库（自动建表 + 写入第一份配置）**。`/init` 端点仅用于「只想建表、暂不写入」的场景。

### 后端实现

**新增 service：`packages/backend/src/services/configStore.ts`**

```typescript
import { createPool } from './pgClient';
import { DbConnectionConfig } from '../types';

const CONFIG_TABLE = '__dbdesign';

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (
  id         INT PRIMARY KEY DEFAULT 1,
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ${CONFIG_TABLE}_single_row CHECK (id = 1)
);`;

/** 确保配置表存在（幂等） */
export async function initConfigTable(config: DbConnectionConfig): Promise<void> {
  const pool = createPool(config);
  try {
    await pool.query(CREATE_TABLE_SQL);
  } finally {
    await pool.end();
  }
}

/** upsert 整个 ProjectFile，返回写入时间 */
export async function saveProjectConfig(
  config: DbConnectionConfig,
  project: unknown
): Promise<string> {
  const pool = createPool(config);
  try {
    await pool.query(CREATE_TABLE_SQL); // 自愈：表不存在则先建
    const result = await pool.query<{ updated_at: string }>(
      `INSERT INTO ${CONFIG_TABLE} (id, config, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE
         SET config = EXCLUDED.config, updated_at = now()
       RETURNING updated_at`,
      [JSON.stringify(project)]
    );
    return result.rows[0].updated_at;
  } finally {
    await pool.end();
  }
}

/** 读取 ProjectFile；表不存在或无数据返回 null */
export async function loadProjectConfig(
  config: DbConnectionConfig
): Promise<{ project: unknown; updatedAt: string } | null> {
  const pool = createPool(config);
  try {
    const exists = await pool.query<{ reg: string | null }>(
      `SELECT to_regclass($1) AS reg`,
      [CONFIG_TABLE]
    );
    if (!exists.rows[0].reg) return null; // 表不存在

    const result = await pool.query<{ config: unknown; updated_at: string }>(
      `SELECT config, updated_at FROM ${CONFIG_TABLE} WHERE id = 1`
    );
    if (result.rows.length === 0) return null;
    return { project: result.rows[0].config, updatedAt: result.rows[0].updated_at };
  } finally {
    await pool.end();
  }
}
```

> `config` 是 JSONB，`pg` 驱动会自动把它反序列化为 JS 对象返回，无需手动 `JSON.parse`。

**新增 route：`packages/backend/src/routes/project.ts`**

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { initConfigTable, saveProjectConfig, loadProjectConfig } from '../services/configStore';
import { DbConnectionConfig } from '../types';

const router = Router();

// POST /api/project/init — 在目标库创建 __dbdesign（幂等）
router.post('/init', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection }: { connection: DbConnectionConfig } = req.body;
    await initConfigTable(connection);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/project/save — upsert 当前 ProjectFile
router.post('/save', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection, project } = req.body;
    if (!project) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'project is required' },
      });
    }
    const updatedAt = await saveProjectConfig(connection, project);
    return res.json({ success: true, updatedAt });
  } catch (err) {
    return next(err);
  }
});

// POST /api/project/load — 读取库中保存的 ProjectFile
// 注意：用 POST 而非 GET，因为连接凭据必须放在请求体，不能进 URL query
router.post('/load', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection }: { connection: DbConnectionConfig } = req.body;
    const result = await loadProjectConfig(connection);
    res.json({ success: true, found: result !== null, ...(result ?? {}) });
  } catch (err) {
    next(err);
  }
});

export default router;
```

**挂载到 `packages/backend/src/index.ts`**

```typescript
import projectRouter from './routes/project';
// ...
app.use('/api/project', projectRouter);   // 与 /api/connection、/api/schema 并列
```

### 前端接线

Vite 已将 `/api` 代理到 `localhost:3001`，**无需改 proxy**。

**1) 类型 `packages/frontend/src/types/api.ts`（追加）**

```typescript
import type { ProjectFile } from './schema';

export interface SaveProjectConfigResponse {
  success: boolean;
  updatedAt?: string;
}
export interface LoadProjectConfigResponse {
  success: boolean;
  found: boolean;
  project?: ProjectFile;   // config 列内容，结构等同 ProjectFile
  updatedAt?: string;
}
```

**2) API 模块 `packages/frontend/src/api/project.ts`（新增）**

```typescript
import client from './client';
import type { DbConnectionConfig, SaveProjectConfigResponse, LoadProjectConfigResponse } from '@/types/api';
import type { ProjectFile } from '@/types/schema';

export async function initProjectTable(connection: DbConnectionConfig): Promise<void> {
  await client.post('/project/init', { connection });
}

export async function saveProjectToDb(
  connection: DbConnectionConfig,
  project: ProjectFile
): Promise<SaveProjectConfigResponse> {
  const { data } = await client.post<SaveProjectConfigResponse>('/project/save', { connection, project });
  return data;
}

export async function loadProjectFromDb(
  connection: DbConnectionConfig
): Promise<LoadProjectConfigResponse> {
  const { data } = await client.post<LoadProjectConfigResponse>('/project/load', { connection });
  return data;
}
```

**3) Toolbar 入口（`components/layout/Toolbar.tsx`）**

在现有「保存 / 打开 JSON」旁增加两个按钮，读取 `connectionStore` 与 `projectStore`：

```typescript
const { config, status } = useConnectionStore();
const { project, loadProject, markSaved } = useProjectStore();
const dbReady = status === 'connected' && !!project;

// 保存到数据库
const handleSaveToDb = async () => {
  if (!project) return;
  const res = await saveProjectToDb(config, project);
  if (res.success) {
    markSaved();
    message.success(`已保存到数据库（${res.updatedAt}）`);
  }
};

// 从数据库加载
const handleLoadFromDb = async () => {
  const res = await loadProjectFromDb(config);
  if (res.found && res.project) {
    loadProject(res.project);
    message.success('已从数据库加载设计');
  } else {
    message.info('该数据库中暂无设计配置');
  }
};
```

- 两个按钮 `disabled={!dbReady}`：只有连接成功且存在项目时可用（加载按钮仅需 `status === 'connected'`）。
- 「保存到数据库」内部自动建表，因此无需单独的初始化按钮；`initProjectTable` 仅在想做独立「初始化」入口时使用。

### 端到端数据流

```
ConnectionPanel 填写并测试连接
        │  status → 'connected'（凭据存于 connectionStore，仅内存）
        ▼
Toolbar「保存到数据库」── api/project.saveProjectToDb(config, project)
        │  POST /api/project/save { connection, project }
        ▼
routes/project → configStore.saveProjectConfig
        │  CREATE TABLE IF NOT EXISTS（自愈） + INSERT ... ON CONFLICT
        ▼
__dbdesign 表（目标库内，一行 JSONB）

反向：Toolbar「从数据库加载」── loadProjectFromDb(config)
        │  POST /api/project/load { connection }
        ▼
configStore.loadProjectConfig → SELECT config WHERE id=1
        ▼
projectStore.loadProject(project)  → 界面渲染恢复
```

### 接口汇总（追加到「后端 API 接口」）

```
POST /api/project/init   → 在目标库创建 __dbdesign 配置表（幂等，可选）
POST /api/project/save   → upsert 当前 ProjectFile，返回 updated_at
POST /api/project/load   → 读取库中保存的 ProjectFile（found=false 表示尚无配置）
```

### 设计要点与风险

| 项 | 说明 |
|------|------|
| 凭据安全 | 沿用现有模式：连接信息仅在请求体内传递，后端 per-request 建池、用完即 `pool.end()`，不持久化 |
| 单行约束 | `CHECK (id = 1)` + 固定 `id=1` upsert，杜绝多行歧义 |
| 表存在性判断 | 加载用 `to_regclass()` 判空，避免对不存在的表查询报错 |
| 与 JSON 文件关系 | 两种持久化通道独立并存，互不覆盖；DB 通道适合「配置随库分发」，文件通道适合离线与 git 版本管理 |
| 命名冲突 | `__dbdesign` 双下划线前缀；逆向导入（`schemaInspector`）时应过滤掉该表，不纳入用户设计 |

### 验证方式

1. 启动本地 PostgreSQL，新建空库 → `ConnectionPanel` 测试连接通过。
2. 设计若干表后点「保存到数据库」→ `psql` 执行 `SELECT id, updated_at, jsonb_pretty(config) FROM __dbdesign;` 确认写入一行。
3. 刷新页面（清空内存状态）→「从数据库加载」→ 设计完整恢复，关系图与字段一致。
4. 再次「保存到数据库」→ 确认仍只有一行（upsert 生效，`updated_at` 刷新）。
5. 对全新库直接点「保存到数据库」→ 确认自愈建表成功，无需手动初始化。

---

## Phase 7 — 表级约束：组合 UNIQUE 与 CHECK（1.5 - 2 天）

### 定位

Phase 1-6 已交付完整设计 / 生成 / 执行 / 逆向 / 对比闭环，但 UNIQUE 与 CHECK 仍**只支持列级**：

- 当前 `FieldDefinition.isUnique` 只能表达单列 UNIQUE，无法生成 `UNIQUE (col_a, col_b)`。
- 当前 `FieldDefinition.checkConstraint` 是列级字符串，PG 虽允许在列级 CHECK 里引用其他列，但语义上"挂在某一列下"是错的（重命名/删除该列会丢失约束）。
- 现实建模高频场景：业务唯一键 `UNIQUE(owner_id, slug)`、时间窗 `CHECK (start_date < end_date)`、金额 `CHECK (total = price * quantity)` 等都无法表达。

Phase 7 引入**表级约束**作为一等公民。组合外键 / 排他约束（EXCLUSION）暂不在范围内。

### 数据模型扩展（`types/schema.ts`）

```typescript
export type TableConstraintKind = 'UNIQUE' | 'CHECK';

export interface TableConstraint {
  id: string;
  name?: string;             // CONSTRAINT <name>，省略时由生成器构造
  kind: TableConstraintKind;
  fieldIds?: string[];       // UNIQUE 必填；CHECK 可选（仅元信息，便于 UI 显示关联列）
  expression?: string;       // CHECK 必填（不含 CHECK 关键字和外层括号）
  comment?: string;
}

interface TableDefinition {
  // ... 原有字段
  constraints?: TableConstraint[];   // 表级约束（向后兼容：旧 JSON 缺该字段视为 []）
}
```

- 不复用 `IndexDefinition` 表达"组合 UNIQUE"：UNIQUE 约束在 PG 中是独立的 catalog 实体，与 INDEX 区分；混淆会让 diff 不准（重建索引 vs 重建约束行为不同）。
- CHECK 的 `fieldIds` 仅作 UI 提示，**不**参与 SQL 生成；表达式真正引用哪些列由 PG 自身解析。

### 后端：逆向导入扩展

**`services/schemaInspector.ts`** 增补查询 `pg_constraint`，过滤 contype IN ('u', 'c')：

```sql
SELECT
  con.conname        AS name,
  con.contype        AS kind,   -- 'u' | 'c'
  pg_get_constraintdef(con.oid) AS def,
  array_agg(att.attname ORDER BY u.ord) FILTER (WHERE att.attname IS NOT NULL) AS columns
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
LEFT JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
LEFT JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = u.attnum
WHERE ns.nspname = $1 AND rel.relname = $2 AND con.contype IN ('u', 'c')
GROUP BY con.conname, con.contype, con.oid;
```

**归类规则**（避免与列级表达重复）：

- `contype = 'u'`，`columns.length == 1` → 已由列级 `isUnique` 表达，跳过。
- `contype = 'u'`，`columns.length >= 2` → 进表级 UNIQUE。
- `contype = 'c'`，`pg_get_constraintdef` 返回形如 `CHECK ((col >= 0))`，conkey 长度 == 1 且表达式只引用该列 → 列级 CHECK（已被 `column.checkConstraint` 表达），跳过。
- 否则 → 进表级 CHECK，剥去外层 `CHECK (` 与末尾 `)`，保留内部表达式。

**API 返回扩展**：`InspectSchemaResponse.tables[i]` 追加 `constraints: DbTableConstraint[]`。

```typescript
interface DbTableConstraint {
  name: string;
  kind: 'UNIQUE' | 'CHECK';
  columns?: string[];        // UNIQUE
  expression?: string;       // CHECK，已剥外层 CHECK(...)
}
```

### 前端：状态 / UI

**`projectStore.ts`**：

```typescript
addTableConstraint:    (tableId, constraint: Omit<TableConstraint,'id'>) => string;
updateTableConstraint: (tableId, constraintId, changes: Partial<TableConstraint>) => void;
deleteTableConstraint: (tableId, constraintId) => void;
```

均设 `isDirty: true`。`partialize` 不需变（约束属于数据结构，应进撤销栈）。

**`TableConstraintsPanel.tsx`**（新组件，挂在 `TableEditor` 内，字段表下方折叠区或独立 Tab）：

- 列表：每行 `kind` 彩色 Tag、name、内容预览（UNIQUE 显示字段名拼接、CHECK 显示表达式 ellipsis）、编辑 / 删除按钮。
- 添加 UNIQUE：Modal 内 `Select mode="multiple"` 选 2 个以上字段 + 可选约束名（占位提示默认会生成 `uq_<table>_<col1>_<col2>`）。
- 添加 CHECK：Modal 内多行 textarea 填表达式 + 可选字段多选（仅元信息）+ 可选约束名（占位 `chk_<table>_<auto>`）。
- 校验：UNIQUE 至少 2 个字段；CHECK 表达式非空、不做语法分析；约束名格式合法（PG 标识符规则）。

**`schemaImporter.ts`**：把 `DbTableConstraint[]` 映射回 `TableConstraint[]`，跳过逆向归类规则中标记为列级的项。

### SQL 生成（`sqlGenerator.ts`）

在 `generateCreateTableStatement` 的列定义后，PRIMARY KEY 行之后，追加约束行：

```typescript
function renderTableConstraint(tc: TableConstraint, tableName: string, fields: FieldDefinition[]): string {
  const fieldName = (id: string) => fields.find(f => f.id === id)?.name ?? '?';
  if (tc.kind === 'UNIQUE') {
    const cols = (tc.fieldIds ?? []).map(id => quoteIdent(fieldName(id))).join(', ');
    const name = tc.name?.trim() || `uq_${tableName}_${(tc.fieldIds ?? []).map(fieldName).join('_')}`;
    return `CONSTRAINT ${quoteIdent(name)} UNIQUE (${cols})`;
  }
  // CHECK
  const name = tc.name?.trim() || `chk_${tableName}_${shortHash(tc.expression ?? '')}`;
  return `CONSTRAINT ${quoteIdent(name)} CHECK (${(tc.expression ?? '').trim()})`;
}
```

输出形如：

```sql
CREATE TABLE "public"."events" (
  "id" BIGSERIAL,
  "start_date" DATE,
  "end_date" DATE,
  PRIMARY KEY ("id"),
  CONSTRAINT "chk_events_dates" CHECK (start_date < end_date),
  CONSTRAINT "uq_events_owner_slug" UNIQUE ("owner_id", "slug")
);
```

`generateProjectDdl` 的「数据表」分节自然带上；「注释」分节不变。

### Diff（`schemaDiff.ts`）

`TableModification` 追加：

```typescript
tableConstraintsAdded:   TableConstraint[];
tableConstraintsDropped: { name: string }[];
```

- 按 `name` 匹配（无 name 时按 `kind` + `fieldIds`/`expression` 哈希作为合成 key）。
- 同 key 但定义不同 → drop + add（PG 不允许 ALTER 改约束定义）。
- DDL 输出：
  - `ALTER TABLE ... DROP CONSTRAINT IF EXISTS "<name>";` 进 `alters` 的 DROP 段。
  - `ALTER TABLE ... ADD CONSTRAINT "<name>" UNIQUE/CHECK (...);` 进 `alters` 的 ADD 段。
- 新增表（在 `tables.added`）的表级约束由 `renderCreateTableBlock` 内联到 `CREATE TABLE` 列定义里，不重复 emit。

### 关系图（可选小改）

- TableNode 不需要为表级约束添加 Handle。
- 在表头右侧可以加一个 🔒 小徽标，鼠标悬停 Tooltip 列出当前所有 UNIQUE / CHECK 约束名（便于巡视）。

### 测试

- `sqlGenerator.test.ts`：① 仅 UNIQUE、② 仅 CHECK、③ UNIQUE + CHECK 共存、④ 与 PK 共存、⑤ 无名约束的自动命名稳定。
- `schemaDiff.test.ts`：① 新增 UNIQUE、② 删除 CHECK、③ 同名约束定义变更（drop+add）、④ 新表内联约束 vs ALTER 路径正确分流。
- `schemaImporter.test.ts`：① 单列 UNIQUE 不被升格为表级、② 多列 UNIQUE 进表级、③ 多列 CHECK 进表级、④ 单列引用本列的 CHECK 不被升格。

### 验收

1. 设计一张 `events(start_date, end_date)`，加 `CHECK (start_date < end_date)`。
2. 设计一张 `team_members(team_id, user_id, role)`，加 `UNIQUE (team_id, user_id)`。
3. SQL 预览正确，执行到本地 PG，`psql \d events` / `\d team_members` 看到两条约束。
4. 故意违反（同一组合插入两次、`end_date < start_date`）→ PG 报错。
5. 逆向导入这两张表 → 表级约束正确出现在新组件列表里，**不**被错误地写成列级。
6. 修改 CHECK 表达式后「对比」→ 生成 `DROP CONSTRAINT ... ; ADD CONSTRAINT ...;` 两条 ALTER；执行后 `\d` 验证表达式已更新。

### 风险与权衡

| 风险 | 应对 |
|------|------|
| 列级 CHECK 与表级 CHECK 语义重叠 | 逆向导入按 conkey 长度 + 引用列分流；UI 引导：单列校验仍走字段行 ConstraintConfig，多列走 TableConstraintsPanel |
| CHECK 表达式不做语法分析 | 不做静态校验，由 PG 在执行时报错；UI 仅做非空校验 |
| 约束名冲突 | PG 约束名 per-table 唯一；工具生成的 `uq_/chk_` 前缀已包含表名与列名，重复概率极低，若用户手填重名 PG 会报错 |
| 删除约束所引用的字段 | 删字段时不主动联动删约束（保持简洁）；执行 SQL 时 PG 报错，由用户回到 UI 修复 |
| `IndexDefinition.isUnique=true` 与 `UNIQUE` 约束语义重叠 | 文档说明：组合唯一性优先用表级 UNIQUE 约束；UNIQUE INDEX 仅作"性能索引"理解 |

### 估时

约 **1.5 - 2 天**：

| 子项 | 估时 |
|------|------|
| 数据模型 + projectStore | 0.5d |
| TableConstraintsPanel UI + 两个添加 Modal | 0.5d |
| sqlGenerator + schemaDiff 改造 | 0.5d |
| schemaInspector 增补 + schemaImporter 接入 + 单测 | 0.5d |
