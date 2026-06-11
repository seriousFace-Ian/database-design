# Phase 9 — 数据库对象层 + 迁移版本管理（规划稿，暂不动手）

> 日期：2026-06-05
> 范围：C 区（函数 / 触发器 / 种子 DML）+ D 区（多文件迁移、`IF NOT EXISTS` 输出、`schema_migrations` 版本表）
> 状态：**只规划、不实施**。等 Phase 8（`development-plan-20260605-phase8.md`）落地、得到真实使用反馈后再启动。
> 触发条件：用户开始把生成结果直接当 migration 使用、或开始用 git 跟踪生成的 `.sql` 文件时，启动本 Phase。

---

## 为什么先不做

Phase 8 完成后，系统能 1:1 复刻 `refe/migrations` 中约 90% 的"结构 DDL"。剩下未覆盖的是：

| 缺失 | 在 refe/ 中的占比 | 跳过的代价 |
|---|---|---|
| `CREATE FUNCTION` / `CREATE TRIGGER` | 每张审计表都有 `updated_at` 触发器 | 用户手工补 `trg_<table>_updated_at` 一行 SQL（可接受） |
| `INSERT … ON CONFLICT` 种子数据 | 仅角色 / 权限 / models 字典三处 | 用户手工另开一个 seed 文件（可接受） |
| 多文件 `.sql` 分卷输出 | 全部 5 个文件 | 用户手工拆分（不便但不阻塞） |
| `IF NOT EXISTS` 等幂等姿势 | 0 处（refe/ 没用，但迁移场景常用） | 用户手工加（不便） |

也就是说，Phase 8 已交付足够覆盖"日常表设计"的能力，Phase 9 是"把生成结果当作正式 migration 用"的进阶能力。**没有强信号要求立即上**，因此本计划只锁定设计方向、不进入实施排期。

---

## C 区 — 数据库对象层

### C1. 函数 `FunctionDefinition`

**数据模型**：

```typescript
export type FunctionLanguage = 'plpgsql' | 'sql';
export type FunctionVolatility = 'IMMUTABLE' | 'STABLE' | 'VOLATILE';

export interface FunctionParameter {
  name?: string;                  // 可省略（按位置传参）
  mode?: 'IN' | 'OUT' | 'INOUT';  // 默认 IN
  type: string;                   // 自由字符串，允许 INTEGER / TEXT / users.id%TYPE 等
  defaultValue?: string;
}

export interface FunctionDefinition {
  id: string;
  schema: string;                 // 默认 public
  name: string;
  language: FunctionLanguage;
  returnType: string;             // 'TRIGGER' / 'VOID' / 'INTEGER' / 'TABLE(...)' 等
  volatility?: FunctionVolatility;
  parameters: FunctionParameter[];
  body: string;                   // 函数体（不含 BEGIN…END$$ 外壳，由生成器包裹）
  comment?: string;
  orReplace?: boolean;            // 默认 true
}
```

**触发函数特例**：函数 `returnType === 'TRIGGER'` 且 `language === 'plpgsql'`，可被触发器引用。系统不强校验，只在触发器选择函数时按此条件过滤。

**典型用例**（来自 `refe/001` 第 9-14 行）：

```typescript
{
  schema: 'public',
  name: 'touch_updated_at',
  language: 'plpgsql',
  returnType: 'TRIGGER',
  parameters: [],
  body: 'BEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;',
}
```

输出：

```sql
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### C2. 触发器 `TriggerDefinition`

**数据模型**：

```typescript
export type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF';
export type TriggerEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
export type TriggerForEach = 'ROW' | 'STATEMENT';

export interface TriggerDefinition {
  id: string;
  name: string;
  tableId: string;                // 归属表
  timing: TriggerTiming;
  events: TriggerEvent[];         // 至少一个；UPDATE 时可附加 updateOfColumns
  updateOfColumns?: string[];     // UPDATE OF col1, col2
  forEach: TriggerForEach;        // 默认 ROW
  whenClause?: string;            // WHEN (...) 谓词
  functionId: string;             // 关联 FunctionDefinition.id
  functionArgs?: string[];        // 调用函数时的字面参数
  comment?: string;
}
```

**输出顺序**：触发器必须在引用的函数与表都已创建后再创建，因此排在所有 `CREATE FUNCTION` + `CREATE TABLE` + `ALTER TABLE ADD CONSTRAINT FK` 之后。

### C3. 种子数据 `SeedRow`

**数据模型**（挂在 `TableDefinition` 上）：

```typescript
export type ConflictStrategy =
  | { kind: 'NOTHING' }
  | { kind: 'NOTHING_ON_CONSTRAINT'; constraintName: string }
  | { kind: 'UPDATE'; targetColumns: string[]; updateColumns: string[] };

export interface SeedRow {
  id: string;
  values: Record<string, string>; // 列名 → SQL 字面量字符串（用户自己保证引号）
}

export interface TableDefinition {
  // ... 已有字段
  seedRows?: SeedRow[];
  seedConflictStrategy?: ConflictStrategy;
}
```

**典型用例**（来自 `refe/002` 第 10-13 行）：

```sql
INSERT INTO roles (name, description) VALUES
  ('admin', '管理员'),
  ('user',  '普通用户')
ON CONFLICT (name) DO NOTHING;
```

UI：表编辑器内新增「种子数据」Tab，以表格形态编辑行；底部下拉选 `ON CONFLICT` 策略。

**取舍**：不支持跨表 `INSERT ... SELECT`（如 `refe/002` 第 40-45 行的 admin 全权限绑定），这种逻辑保留为「自由 SQL 块」：每张表底部一个 `extraSqlAfter: string` 字段，原样附加到 DDL 末尾。可后续单独迭代。

### C4. DDL 输出新顺序

```
1. CREATE TYPE                   (ENUM)
2. CREATE OR REPLACE FUNCTION    (函数)
3. CREATE TABLE                  (拓扑排序)
4. ALTER TABLE ADD CONSTRAINT FK
5. CREATE INDEX
6. CREATE TRIGGER                (依赖函数 + 表，故排在两者之后)
7. COMMENT ON TABLE / COLUMN
8. INSERT ... ON CONFLICT        (种子)
9. <表级 extraSqlAfter>           (自由 SQL 兜底)
```

### C5. UI 增改

- **侧栏新增分组**：「函数」、「触发器」（与「数据表」、「ENUM 类型」并列）
- **函数编辑器**：CodeMirror（已在依赖里？需调研）或简单的 `<Textarea>` 等宽字体；右上角「测试编译」按钮可选（远期）
- **触发器编辑器**：表选择 + 时机 + 事件多选 + 函数选择（下拉过滤 `returnType=TRIGGER`）+ WHEN 表达式
- **表级 SeedTab**：表格 + 列定义对应 + `ON CONFLICT` 配置
- **关系图**：触发器以表头小铃铛图标提示，悬停 Tooltip 列出本表的所有触发器名

### C6. 逆向导入

- `pg_proc` JOIN `pg_namespace` 读用户函数（过滤 `prokind = 'f'`，排除聚合 / 窗口）
- `pg_trigger` JOIN `pg_proc` 读触发器（过滤 `tgisinternal = false`）
- 种子数据**不**逆向（PG 无法区分"配置数据"与"用户数据"，强行导入会拉爆 JSON）

### C7. Diff

- 函数：按 `(schema, name)` 比签名 + body；不同则 `CREATE OR REPLACE`
- 触发器：按 `(table, name)` 比；不同则 `DROP TRIGGER` + `CREATE TRIGGER`
- 种子数据：**不参与 diff**，每次执行均按 ON CONFLICT 策略幂等 INSERT

---

## D 区 — 多文件迁移与输出选项

### D1. 迁移版本表

数据模型新增顶层：

```typescript
export interface MigrationEntry {
  id: string;
  version: string;                // 'V001' / '20260605_001' / 用户自定义
  title: string;                  // 'base schema' / 'add roles'
  description?: string;
  statements: MigrationStatement[]; // 与项目当前结构脱钩的快照
  createdAt: string;
}

export interface MigrationStatement {
  kind: 'ddl' | 'dml' | 'raw';
  sql: string;
}

export interface ProjectFile {
  // ... 已有字段
  migrations?: MigrationEntry[];   // 项目级 migration 列表
  currentMigrationDraft?: string;  // 进行中的 migration ID（草稿态）
}
```

**核心选择**：migration 是**快照**，不是当前 `tables/enums/...` 的实时投影。一旦创建，就冻结其 `statements`。

### D2. 工作流

```
新建项目 → 设计表 → 「冻结为 V001 base schema」 → 生成的 DDL 写入 V001 statements
                                  ↓
继续修改设计 → 「对比 V001 → 生成 V002 草稿」 → 把 schemaDiff 输出写入 V002
                                  ↓
                       继续修改设计 → 生成 V003 草稿 → ...
                                  ↓
导出 → ZIP 包含 V001_base_schema.sql / V002_add_xxx.sql / ...
```

第一次冻结：全量 CREATE。
后续冻结：自动用 `schemaDiff` 对比上一份 migration 的"目标态"与当前设计 → 输出 ALTER。

### D3. 内置 `schema_migrations` 跟踪表

可选输出（导出/执行时勾选「使用 migration 跟踪表」）：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

每个 migration 末尾追加：

```sql
INSERT INTO schema_migrations (version) VALUES ('V001') ON CONFLICT DO NOTHING;
```

执行时按 `version` 字典序读 `schema_migrations`，跳过已应用版本。

### D4. 多文件分卷输出

「导出 SQL」按钮在 Phase 9 后支持两种模式：

- **单文件**（现状）：所有迁移合并为一个 `.sql`
- **多文件 ZIP**：每个 migration 一个文件，命名 `<version>_<slug-title>.sql`，再附带 `README.md` 说明执行顺序

实现上需要前端打包 ZIP（推荐 `jszip` 或 `client-zip`，体积小）。

### D5. 输出选项面板

`SqlPreviewModal` 顶部加全局开关：

- ☑ 输出 `IF NOT EXISTS`（CREATE TABLE / CREATE INDEX / CREATE TYPE 全适用）
- ☑ 函数用 `CREATE OR REPLACE`（默认开）
- ☑ 触发器输出前先 `DROP TRIGGER IF EXISTS`（默认开，保证可重入）
- ☑ 包含 `schema_migrations` 跟踪
- ☐ 包含表级 `extraSqlAfter` 自由 SQL（默认开，给安全开关）

### D6. 执行通道

`ExecuteDdlModal` 增加 migration 选择：用户选「执行至 V003」或「仅执行 V002」。执行前查询 `schema_migrations` 显示已应用状态。

---

## E 区 — 现有数据模型 UI 缺口补齐

> 这一区收纳"模型层和 SQL/导入路径都已就绪、但 UI 未暴露"的小缺口。逐项颗粒度很小，可与 C/D 并行做、也可在某次 hotfix 单独发。

### E1. 数组字段 UI（`isArray`）

**现状**：
- `FieldDefinition.isArray: boolean` 已存在于 `types/schema.ts`。
- `sqlGenerator.ts` 的 `renderFieldType` 在 `isArray` 为真时输出 `${base}[]`。
- `schemaImporter.ts` 的 `parseType` 能识别 PG 内部数组类型（`_int4` 等）并置 `isArray: true`。
- **UI 层完全没有写入路径** —— `FieldTypeSelect.tsx` 没有数组开关；用户只能改 JSON 或从已有库导入获得数组列。

**设计**：
- 在 `FieldTypeSelect` 的类型下拉**右侧**追加一个紧凑 `[]` Checkbox（或一个带 tooltip 的小按钮），仅当所选类型非 `USER-DEFINED` 时显示（PG 不允许 ENUM 数组的列表达；其实允许，但工具暂不推广，避免歧义）。
- 切换数组开关只改 `isArray`，不动 `type / length / precision`。
- 字段表「类型」列预览同步追加 `[]` 后缀，避免用户看不见状态。
- 关系图 `TableNode` 字段行类型预览同样追加 `[]`（当前已经支持 `INTEGER[]` 文本渲染，验证一下确实走 `renderFieldType` 即可）。

**测试**：
- `sqlGenerator.test.ts` 增 1 条：`isArray = true` 时输出 `TEXT[]` / `INTEGER[]`（已有"渲染长度/精度/数组"测试覆盖了部分，但是直接构造 `field({ isArray: true })` 进行；E1 不引入新 SQL，主要补 UI 操作 → 状态写入 → SQL 输出的端到端用例）。
- 手测：勾上 → 字段表预览出现 `[]` → SQL 预览同步出现 `[]` → 取消勾选 → `[]` 消失。

**估时**：0.15d（纯前端 UI + 一条端到端测试）。

### E2.（占位）

随实际使用发现的小 UI 缺口在此追加。例如：
- `IndexColumn.nulls`（NULLS FIRST/LAST）：模型已支持，UI 目前只在编辑 Modal 隐藏 / 不展示。如果用户开始关心则补显式开关。
- 外键约束名上锁 / 自动重命名跟随字段重命名：当前需手动改。

---

## 数据模型变更总览

| 文件 | 变更 |
|---|---|
| `types/schema.ts` | + `FunctionDefinition` + `TriggerDefinition` + `SeedRow` + `MigrationEntry`；`TableDefinition` + `seedRows / extraSqlAfter`；`ProjectFile` + `functions / triggers / migrations` |
| `projectStore.ts` | + 函数/触发器/种子 CRUD；+ `freezeMigration()` / `restoreFromMigration()` |
| `sqlGenerator.ts` | 输出顺序重构；按全局选项加 IF NOT EXISTS / OR REPLACE / DROP IF EXISTS |
| `schemaInspector.ts` | + 函数 / 触发器查询 |
| `schemaImporter.ts` | + 映射函数 / 触发器；种子数据**不**导入 |
| `schemaDiff.ts` | + 函数 / 触发器 diff；种子不参与 |
| 新组件 | `FunctionEditor` / `TriggerEditor` / `SeedDataTab` / `MigrationList` / `ExportZipModal` |

---

## 估时（仅供未来排期参考）

| 子区 | 估时 |
|---|---|
| C1 函数模型 + 编辑器 + SQL 输出 + 逆向 | 1.5d |
| C2 触发器模型 + 编辑器 + SQL 输出 + 逆向 | 1d |
| C3 种子数据 + 自由 SQL 兜底 | 1d |
| C4 输出顺序重排 + 测试 | 0.5d |
| D1+D2 Migration 快照模型 + 冻结流程 | 1d |
| D3 schema_migrations 跟踪表 + 执行端 | 0.5d |
| D4 多文件 ZIP 导出 | 0.5d |
| D5 输出选项面板 | 0.25d |
| E1 数组字段 UI（`isArray` 开关） | 0.15d |
| 单元 + 端到端 | 1d |

**合计 ~7.4 天**，约为 Phase 8 的 1.7 倍。是否启动取决于实际使用反馈。E 区可在不启动 Phase 9 主体的前提下单独发；E1 建议第一个搭车。

---

## 启动 Phase 9 的判定标准

满足以下任一即应启动：

1. 用户开始用 git 跟踪生成的 `.sql` 文件，并明确表示需要"分版本提交"
2. 用户至少手工补过 3 次 `CREATE TRIGGER` / `CREATE FUNCTION` 来对齐 `updated_at` 触发器
3. 同一项目的设计跨越超过 3 次"重大重构"，每次都全量重建数据库的成本变得不可接受
4. 上线时间表里明确要求"和 Flyway / Liquibase / golang-migrate 等迁移工具配合"

否则维持 Phase 8 形态即可。
