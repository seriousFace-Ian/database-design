# DB Design — 本地 PostgreSQL 数据库设计工具

> [English](README.md) | 简体中文

可视化地设计 PostgreSQL 数据表，导出 `.sql` 文件或直接把 DDL 执行到本地数据库；项目状态以 `.dbdesign.json` 形式落到本地文件，也可以一行 JSONB 存进目标库自身（`__dbdesign` 表），随库分发。

## 功能速览

- 字段表编辑器：完整字段属性（类型 / 长度 / 精度 / 主键 / 唯一 / 默认值 / CHECK / 注释 / 外键 / 软删除等）。
- ENUM 自定义类型 + 在字段类型下拉中按 schema.name 引用。
- 外键弹窗：选引用表 + 字段 + `ON DELETE`/`ON UPDATE` 动作。
- 一键审计字段：可选时间戳（`created_at` / `updated_at` / `deleted_at`）、操作者（`created_by` / `updated_by` / `deleted_by`，类型可选 BIGINT / INTEGER / UUID，以对齐目标库 `users` 主键），以及乐观锁 `version`、`created_ip` / `updated_ip`、`tenant_id`。核心六项默认勾选，其余按需勾选。
- 关系图（React Flow）：字段级 Handle、dagre 自动布局、全屏、视口/位置持久化。
- SQL 预览 + 复制 + `.sql` 下载。
- DDL 直接执行到所连 PostgreSQL：事务模式（出错整体回滚）/ 逐条模式（继续执行），逐条状态展示。
- 从已有库逆向导入结构为可编辑项目。
- DB-embedded 配置：把整份 `ProjectFile` 以一行 JSONB 存进目标库的 `__dbdesign` 表，「存库」/「读库」一键互转。
- 撤销/重做、全局键盘快捷键、结构对比（`ALTER` 预览）。

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 |
| 状态 | Zustand + zundo（撤销）|
| 关系图 | @xyflow/react v12 + @dagrejs/dagre |
| 后端 | Express + TypeScript + `pg` 驱动 |
| 测试 | Vitest |

## 系统要求

- Node.js ≥ 18（推荐 LTS）。
- npm ≥ 9（启用 workspaces）。
- 本地或可访问的 PostgreSQL ≥ 12（仅在使用「测试连接 / 执行 DDL / 存库 / 导入」时需要）。
- 浏览器需支持 File System Access（保存/打开 `.dbdesign.json`），Chrome / Edge 已支持。Safari / Firefox 上回退到下载方式。

## 启动

```bash
# 安装根+所有子包依赖（npm workspaces）
npm install

# 同时启动前后端
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001 （健康检查 `/api/health`）
- Vite 已把 `/api/*` 代理到 `localhost:3001`，无需手工配置 CORS。

也可以单独运行：

```bash
npm run dev:fe   # 前端 Vite
npm run dev:be   # 后端 ts-node-dev
```

## 常用脚本

```bash
npm run build                              # 构建前端 → packages/frontend/dist
npm run test                               # 跑前端 Vitest 测试

# 单个测试文件
npm run test --workspace=packages/frontend -- --run sqlGenerator
```

后端单独构建：

```bash
npm --workspace=packages/backend run build  # tsc → dist/
npm --workspace=packages/backend run start  # node dist/index.js
```

## 配置

后端默认端口 3001，CORS 默认放行 `http://localhost:5173`。如需自定义，在 `packages/backend/` 下放 `.env`：

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

数据库连接凭据**不会**落到服务器：每个 `/api/*` 请求自带连接信息，后端建池→执行→`pool.end()` 立即关闭。前端把连接配置（含密码）放在 `sessionStorage`，关闭浏览器标签即清空。

## 快捷键

| 键位 | 作用 |
|------|------|
| `Ctrl/Cmd + S` | 保存当前项目到 `.dbdesign.json` |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | 撤销 / 重做（zundo）|
| `Delete` | 删除当前选中表（带二次确认）|
| `Escape` | 关闭当前 Modal / 取消单元格编辑 |

在表格 / 输入框中编辑时，全局快捷键自动让位给行内编辑。

## 项目结构

```
docs/                  规划与教程（含 guideline/diagram-view.md）
packages/
  backend/             Express，端口 3001
    src/routes/        connection / schema / project
    src/services/      pgClient · schemaInspector · configStore · schemaDiff
  frontend/            React + Vite，端口 5173
    src/components/    layout · sidebar · editor · diagram · sql · connection
    src/store/         projectStore（zundo）· uiStore · connectionStore
    src/utils/         sqlGenerator · schemaImporter · layoutEngine
```

## 文档

- 系统使用说明：[`docs/guideline/usage.md`](docs/guideline/usage.md)
- 关系图教程：[`docs/guideline/diagram-view.md`](docs/guideline/diagram-view.md)
- 详细开发计划：[`docs/plan/development-plan-20260527.md`](docs/plan/development-plan-20260527.md)

## License

MIT — see [`LICENSE`](LICENSE).
