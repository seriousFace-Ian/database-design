# 左侧 Sidebar 数据表文件夹分类

## 执行情况

|项目|详情|
|---|---|
|完成度|100%|
|计划起草日期|20260610|
|计划完成日起|20260610|

## Context

来源：`docs/plan/development-plan-20260609.md` 的 V1 调整项 ——「数据表支持文件夹分类」。

当前 Sidebar (`packages/frontend/src/components/sidebar/Sidebar.tsx`) 将 `project.tables` 平铺渲染。在表数量增长（一个完整业务模块通常 20+ 张表）后，用户难以按业务模块（如 `用户` / `订单` / `日志`）进行视觉聚类。本次新增「文件夹分类」功能，让用户在 Sidebar 把表分组归纳，分组定义持久化到 `.dbdesign.json` 中。

设计决策（已与用户确认）：
- **仅一层**结构（不嵌套）
- **拖拽 + 右键菜单**两种方式都支持表的移动
- **未分类表显示在所有分组的底部**（不放进「未分类」节点）

---

## 数据模型变更

文件：`packages/frontend/src/types/schema.ts`

新增 `TableCategory` 类型，挂在 `ProjectFile` 上；`TableDefinition` 增加可选 `categoryId`。

```ts
export interface TableCategory {
  id: string;
  name: string;
  order: number;            // 分组在 Sidebar 中的排序
  color?: string;           // 预留，本期 UI 暂不消费
}

export interface TableDefinition {
  // ... 现有字段
  categoryId?: string;      // undefined = 未分类
}

export interface ProjectFile {
  // ... 现有字段
  categories?: TableCategory[];  // 老项目缺省即空数组
}
```

保持 `version: '1.0'` 不变（新增字段全部可选，老 `.dbdesign.json` 直接兼容）。

---

## Store 改造

文件：`packages/frontend/src/store/projectStore.ts`

1. **`normalizeProject` 回填**：`categories: file.categories ?? []`。
2. **新增 action**（沿用现有 `set(...)` 风格、同步置 `isDirty: true` 与 `updatedAt`）：
   - `addCategory(name): string` — 返回新 categoryId，`order` 取末位
   - `renameCategory(categoryId, name)`
   - `deleteCategory(categoryId)` — 将该分组下所有表的 `categoryId` 清空，分组移除
   - `reorderCategories(fromIndex, toIndex)` — 同 `reorderFields` 实现模式 (projectStore.ts:328)
   - `moveTableToCategory(tableId, categoryId | null)` — 复用 `updateTable` 内部 patch 逻辑
3. **zundo `partialize`** 不需要排除新字段：分组结构属于数据，应当可撤销。

---

## UI 改造

文件：`packages/frontend/src/components/sidebar/Sidebar.tsx`（重写表列表渲染部分）

采用 Ant Design `Tree`（CLAUDE.md 已用 antd v5），内置 `draggable` 提供节点间拖拽，避免引入新的 DnD 体系。

```
[Header：搜索框 + 「新建表」按钮 + 新增「新建分组」按钮]
[Tree]
  ├ 📁 用户模块 (3)        ← 分组节点：可展开 / 折叠 / 拖拽排序 / 右键改名删除
  │   ├ users
  │   ├ user_profiles
  │   └ user_sessions
  ├ 📁 订单模块 (2)
  │   ├ orders
  │   └ order_items
  └ （未分类的表平铺在最底部，无父节点）
      ├ schema_migrations
      └ audit_logs
```

实现要点：

- **treeData 组装**：按 `categories[i].order` 升序生成分组节点；每组下塞 `tables.filter(t => t.categoryId === cat.id)`；未分类的 `tables.filter(t => !t.categoryId || !categoryMap.has(t.categoryId))` 作为顶层叶子节点附加在最后。这样满足「未分类显示在底部」。
- **titleRender**：对叶子节点复用 `TableListItem.tsx` 的视觉（icon + 名字 + 字段数 + Dropdown 菜单），对分组节点渲染 `📁 名称 (count) + Dropdown(改名/删除)`。`TableListItem` 中已有的「选中高亮、hover 背景、内联重命名」逻辑保留。
- **expandedKeys**：用 `Sidebar` 本地 `useState`（不入 store、不入文件）。V1 简化；如果用户后续反馈想跨刷新保留，再迁移到 `uiStore`。
- **selection**：`selectedKeys={[selectedTableId]}`，`onSelect` 调 `selectTable`。分组节点不可选（在 `treeData` 节点上 `selectable: false`）。
- **draggable**：
  - 表拖到分组节点 → `moveTableToCategory(tableId, targetCategoryId)`
  - 表拖到顶层空白或拖到「未分类」区域 → `moveTableToCategory(tableId, null)`
  - 分组节点之间拖动 → `reorderCategories`
  - `onDrop` 回调用 `info.dragNode` / `info.node` / `info.dropPosition` 判断类型，跨类型拖拽（如把分组拖进分组）一律拒绝。
- **右键菜单**（在 `TableListItem` 的现有 Dropdown 中追加一项）：
  - `移动到分组 ▸` 二级菜单：列出所有 `categories`，最末是「移出分组（未分类）」。点击即调 `moveTableToCategory`。
- **搜索行为**：当 `search` 非空时，把命中表降级为平铺渲染（与现状一致），不渲染分组。一是实现简单，二是搜索结果按分组分块反而让用户更难扫视。

文件：`packages/frontend/src/components/sidebar/TableListItem.tsx`

- 仍由 Tree 的 `titleRender` 调用，去掉自身的根容器 padding/border 由 Tree 提供，保留 hover / 选中样式。
- Dropdown menu 增加「移动到分组 ▸」一项，submenu 内容由 props 透传 categories 列表 + 当前 categoryId。

新增文件：`packages/frontend/src/components/sidebar/CategoryNodeTitle.tsx`

- 分组节点的 titleRender 组件：图标 + 名字 + count + Dropdown（改名 / 删除）。
- 删除时弹 `Modal.confirm` 提示「该分组下 N 张表将变为未分类，不会被删除」。

---

## 关键文件清单

| 路径 | 改动类型 |
|---|---|
| `packages/frontend/src/types/schema.ts` | 加 `TableCategory`、扩展 `TableDefinition`、`ProjectFile` |
| `packages/frontend/src/store/projectStore.ts` | 加 5 个 action + `normalizeProject` 回填 |
| `packages/frontend/src/components/sidebar/Sidebar.tsx` | 列表渲染改 `Tree`，加「新建分组」按钮 |
| `packages/frontend/src/components/sidebar/TableListItem.tsx` | Dropdown 加「移动到分组」子菜单；脱离自带容器以适配 Tree titleRender |
| `packages/frontend/src/components/sidebar/CategoryNodeTitle.tsx` | 新增 |

---

## 验证

1. `npm run dev` 启动；新建空项目 → 新建分组「用户」「订单」→ 新建几张表 → 拖到分组内 → 关闭刷新（用浏览器 File API 保存 `.dbdesign.json`）→ 重新打开 → 验证分组结构、表归属、分组顺序都正确恢复。
2. **向后兼容**：用一个旧的（不带 `categories` 字段的）`.dbdesign.json` 打开，确认所有表平铺在底部、无报错；新增一个分组后保存，重新打开，确认新字段正确写入。
3. **删除分组**：删除有表的分组 → 确认弹出确认框 → 确认后表全部变成未分类、出现在 Sidebar 底部、外键引用无丢失。
4. **撤销**：拖拽表跨分组、新建分组、删除分组、改名分组 → 各执行一次，Ctrl+Z 验证逐步回滚正常。
5. **搜索**：搜索框输入关键字 → 列表切换为平铺命中模式；清空恢复分组视图。
6. **右键菜单**：表右键「移动到分组 ▸」子菜单列出全部分组 + 「移出分组」，点击后立即生效。
7. `npm run test` 通过现有测试套件（本次改动不涉及 SQL 生成 / 后端接口，预期无回归）。
