# PostgreSQL 设计规范覆盖度评估 + 分阶段补全计划

> 日期：2026-06-11
> 范围：对照「主流 PostgreSQL 数据库/表设计规范」体检现有能力，列出缺口并给出分阶段补全路线。
> 状态：**评估 + 规划**。阶段 1 已另出可执行方案（见 `development-plan-20260611-types-and-generated-columns.md`）。
> 关联：本文是 `development-plan-20260605-phase8.md`（已落地）与 `development-plan-20260605-phase9.md`（已规划未实施）的上层视图，补充了 Phase 9 也未覆盖的能力。

---

## 一、结论速览

单表 **DDL 设计主线**（列属性 → 五大约束 → 索引高级特性 → ENUM → 注释 → 逆向 → schema diff → 事务化执行）已经闭环且扎实，达到主流建表工具的 PostgreSQL 子集水准，部分细节（EXCLUDE 全参数、索引 opclass/INCLUDE/部分索引）更细。

差距集中在五个方向：

1. **类型库广度** —— 只覆盖最常用的十余种，缺二进制/网络/位/区间/全文/几何等主流类型。
2. **列级现代特性** —— 缺生成列（`GENERATED ALWAYS AS … STORED`）、复合外键。
3. **数据库对象层** —— 缺视图/物化视图、函数/触发器、独立序列、域/复合类型、扩展。
4. **企业级能力** —— 缺分区、行级安全（RLS）、权限（GRANT/角色）、迁移版本管理。
5. **设计质量校验** —— 无任何 Lint/告警（无主键、FK 未建索引、命名规范等）。

其中函数/触发器/种子数据/迁移已在 Phase 9 规划；**视图、扩展、分区、RLS、生成列、复合外键、`CREATE SCHEMA` 输出**连规划都尚未覆盖。

---

## 二、已覆盖（对照建表规范）

| 维度 | 覆盖情况 |
|---|---|
| 字段类型 | 整数 / 文本 / 数值 / 日期时间 / 布尔 / UUID / JSON·JSONB / ENUM；数组（模型+SQL+导入，**缺 UI**） |
| 列属性 | NOT NULL、默认值、注释、主键、唯一、`GENERATED … AS IDENTITY` |
| 约束 | PRIMARY KEY（复合）、FOREIGN KEY（单列 + ON DELETE/UPDATE）、UNIQUE（列级 + 表级多列）、CHECK（列级 + 表级）、EXCLUDE（USING/元素/WHERE/DEFERRABLE 全参数） |
| 索引 | B-tree/Hash/GIN/GiST/BRIN/SP-GiST、唯一、部分索引（WHERE）、表达式列、opclass、ASC/DESC、NULLS、INCLUDE |
| 注释 | `COMMENT ON TABLE / COLUMN` |
| 逆向工程 | 表 / 列 / FK / 索引 / ENUM / 表级约束 / IDENTITY，自动跳过 `__dbdesign` |
| 变更管理 | schema diff → ALTER 预览（列增删改、FK、索引、表级约束、ENUM 加值、PK 变更） |
| 执行 / 持久化 | 事务化 / 逐条执行；JSON 文件 + DB 内嵌 JSONB 双通道 |

---

## 三、缺口分析（按优先级；标注是否已在 Phase 9 规划）

### 🔴 P1 — 表设计核心能力

| 缺口 | 说明 | Phase 9 是否已规划 |
|---|---|---|
| 类型库太窄 | 缺 `BYTEA`、`INET/CIDR/MACADDR`、`INTERVAL`、`MONEY`、`BIT/BIT VARYING`、`XML`、`TSVECTOR/TSQUERY`、几何、**区间类型**（`tstzrange` 等，EXCLUDE 常用搭档）；时间精度 `TIMESTAMP(p)` 无法表达 | 否 |
| 生成列 | 只有 IDENTITY，缺 `GENERATED ALWAYS AS (expr) STORED`（PG12+ 常用） | 否 |
| 复合外键 | FK 挂在单列上，无法表达 `FOREIGN KEY (a,b) REFERENCES t(c,d)`；缺 `DEFERRABLE`/`MATCH`/`NOT VALID` | 否 |
| `CREATE SCHEMA` 不输出 | 表/ENUM 有 `schema` 字段，DDL 却从不建 schema → 非 `public` schema 执行即失败 | 否 |
| 扩展无管理 | 代码已提示用户自己 `CREATE EXTENSION btree_gist`（`TableConstraintsPanel.tsx:501`）却不生成；`uuid-ossp`/`pgcrypto`/`btree_gist`/`postgis` 都需先建 | 否 |
| 数组字段 UI | 模型/SQL/导入已通，只差下拉旁 `[]` 开关 | 是（Phase 9 E1） |

### 🟠 P2 — 数据库对象层

| 缺口 | 说明 | Phase 9 是否已规划 |
|---|---|---|
| 视图 / 物化视图 | `CREATE VIEW` / `MATERIALIZED VIEW` 完全缺失 | 否 |
| 函数 + 触发器 | 尤其 `updated_at` 自动 touch 触发器，几乎每张审计表都要 | 是（C1/C2） |
| 独立序列对象 | `CREATE SEQUENCE`（start/increment/cache/cycle/owned by） | 否 |
| 域 / 复合类型 / 区间类型 | `CREATE DOMAIN`、`CREATE TYPE AS (...)`、`CREATE TYPE AS RANGE` | 否 |

### 🟡 P3 — 企业级 / 迁移 / 安全

| 缺口 | 说明 | Phase 9 是否已规划 |
|---|---|---|
| 分区表 | `PARTITION BY RANGE/LIST/HASH` + 分区子表 | 否 |
| 行级安全 RLS | `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` | 否 |
| 权限 | `GRANT/REVOKE` + `CREATE ROLE` | 否 |
| 种子数据 + 迁移管理 | `INSERT … ON CONFLICT`、多文件分卷、`IF NOT EXISTS` 幂等、`schema_migrations` 跟踪 | 是（C3 / D 区） |
| 表存储选项 | `UNLOGGED`/`TEMPORARY`、`WITH (fillfactor=…)`、`TABLESPACE`、`INHERITS` | 否 |

### 🟢 P4 — 设计质量与开发体验

| 缺口 | 说明 |
|---|---|
| 设计 Lint | 无主键告警、FK 列未建索引提示、命名规范（snake_case/保留字）、`TEXT` 滥用、孤立 ENUM |
| diff 薄弱点 | 列重命名被识别成"删+加"会丢数据；ENUM 值只能加不能改名/删；`ALTER COLUMN TYPE USING` 是裸 `col::type` |
| 逆向导入补全 | 函数/触发器/视图/分区/RLS 目前都不导入 |

---

## 四、分阶段补全计划

> 原则：先收"已有模型只差 UI"的低垂果实 → 再补"表设计核心" → 再做"对象层" → 最后"企业级 + 质量"。每阶段独立可发版。

### ▶ 阶段 0：低垂果实（~0.5d）
- 数组字段 UI（Phase 9 E1，模型已就绪）。
- 索引 `NULLS FIRST/LAST` 等隐藏选项在 Modal 显式暴露。

### ▶ 阶段 1：表设计核心补强（~3–4d）—— 已出可执行方案
- 扩充类型库（二进制/网络/位/区间/全文/几何 + 时间精度）。
- 生成列 `GENERATED ALWAYS AS (expr) STORED`。
- 复合外键 + FK `DEFERRABLE`/`MATCH`/`NOT VALID`（破坏性改动，建议单独排期）。
- `CREATE SCHEMA` 输出 + 扩展管理。

> 详见 `development-plan-20260611-types-and-generated-columns.md`（本阶段先做侵入最小的「类型库 + 生成列」）。

### ▶ 阶段 2：数据库对象层（~5–6d，= Phase 9 C 区 + 视图）
- 函数 + 触发器（含一键 `updated_at` 触发器模板）。
- 视图 / 物化视图（SQL 体编辑 + 依赖排序 + 逆向）。
- 独立序列对象、域 / 复合类型。

### ▶ 阶段 3：迁移 + 企业级（~7d，= Phase 9 D 区 + 扩展）
- 种子数据 + 迁移版本管理 + 多文件/幂等输出（Phase 9 C3/D 整体落地）。
- 分区表、RLS + POLICY、GRANT/角色、表存储参数（按需求强度择一先做）。

### ▶ 阶段 4：质量与 DX（穿插，~2–3d）
- 设计校验面板（无主键 / FK 未建索引 / 命名规范 / 保留字 / 孤立 ENUM）。
- diff 增强（列重命名识别、ENUM 值改名删除、`ALTER COLUMN TYPE USING` 自定义）。
- 逆向导入补全（函数/触发器/视图/分区/RLS）。

---

## 五、启动判定

- **阶段 0/1**：随时可启动，对架构侵入小、体感提升直接 → 建议立即。
- **阶段 2**：当用户开始手工补 `CREATE VIEW` / `updated_at` 触发器 ≥ 3 次时启动（沿用 Phase 9 判定）。
- **阶段 3**：当明确要对接 Flyway/Liquibase 做正式迁移，或上分区/RLS/多租户时启动。
- **阶段 4**：可与任意阶段并行，作为质量护栏持续补。
