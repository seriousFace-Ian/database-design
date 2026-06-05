import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  FkAction,
  TableConstraint,
  IndexDefinition,
  IndexColumn,
} from '@/types/schema';
import { typeHasLength, typeHasPrecision } from './typeDefinitions';

// ==================== 基础工具：标识符 / 字面量转义 ====================

/** 双引号包裹标识符，内部双引号翻倍 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** schema 限定名：与 PostgreSQL 一致，默认 schema 也显式写出 */
function qualified(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

/** 单引号字符串字面量，内部单引号翻倍 */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ==================== 字段类型渲染 ====================

/** 根据字段定义渲染列类型（含长度/精度/ENUM/数组） */
function renderFieldType(field: FieldDefinition, enums: EnumType[]): string {
  let base: string;

  if (field.type === 'USER-DEFINED') {
    const enumDef = enums.find(e => e.id === field.enumTypeId);
    // 找不到引用的 ENUM 时退化为 TEXT，避免产出无法执行的 DDL
    base = enumDef ? qualified(enumDef.schema, enumDef.name) : 'TEXT';
  } else if (typeHasLength(field.type) && field.length) {
    base = `${field.type}(${field.length})`;
  } else if (typeHasPrecision(field.type) && field.precision) {
    base = field.scale != null
      ? `${field.type}(${field.precision}, ${field.scale})`
      : `${field.type}(${field.precision})`;
  } else {
    base = field.type;
  }

  return field.isArray ? `${base}[]` : base;
}

// ==================== 单列定义 ====================

/** 渲染 CREATE TABLE 中的一行列定义（不含表级 PK，PK 在表级统一处理） */
function renderColumnDefinition(field: FieldDefinition, enums: EnumType[]): string {
  const parts: string[] = [quoteIdent(field.name), renderFieldType(field, enums)];

  // 主键列由表级 PRIMARY KEY 约束保证 NOT NULL，这里不再重复 NOT NULL
  if (!field.nullable && !field.isPrimaryKey) {
    parts.push('NOT NULL');
  }
  // IDENTITY 与 DEFAULT 互斥；IDENTITY 优先并隐式 NOT NULL
  if (field.identity) {
    parts.push(`GENERATED ${field.identity} AS IDENTITY`);
  } else if (field.defaultValue != null && field.defaultValue !== '') {
    parts.push(`DEFAULT ${field.defaultValue}`);
  }
  // 主键已隐含唯一，避免冗余 UNIQUE
  if (field.isUnique && !field.isPrimaryKey) {
    parts.push('UNIQUE');
  }
  if (field.checkConstraint && field.checkConstraint.trim()) {
    parts.push(`CHECK (${field.checkConstraint.trim()})`);
  }

  return parts.join(' ');
}

// ==================== CREATE TYPE（ENUM） ====================

function generateEnumStatements(enums: EnumType[]): string[] {
  return enums.map(e => {
    const values = e.values.map(quoteLiteral).join(', ');
    return `CREATE TYPE ${qualified(e.schema, e.name)} AS ENUM (${values});`;
  });
}

// ==================== CREATE TABLE（拓扑排序） ====================

/**
 * 按外键依赖对表做拓扑排序：被引用的表排在前面。
 * 由于 FK 通过独立的 ALTER 语句添加，循环外键不会导致失败；
 * 此处遇到环时对剩余节点退回原始顺序，保证函数终止。
 */
function topologicalSortTables(tables: TableDefinition[]): TableDefinition[] {
  const byId = new Map(tables.map(t => [t.id, t]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const result: TableDefinition[] = [];

  const visit = (table: TableDefinition) => {
    if (visited.has(table.id)) return;
    if (inStack.has(table.id)) return; // 检测到环，停止递归（FK 由 ALTER 处理）
    inStack.add(table.id);

    for (const field of table.fields) {
      const refId = field.foreignKey?.referenceTableId;
      if (refId && refId !== table.id) {
        const ref = byId.get(refId);
        if (ref) visit(ref);
      }
    }

    inStack.delete(table.id);
    visited.add(table.id);
    result.push(table);
  };

  for (const table of tables) visit(table);
  return result;
}

function generateCreateTableStatement(table: TableDefinition, enums: EnumType[]): string {
  const lines: string[] = table.fields.map(f => `  ${renderColumnDefinition(f, enums)}`);

  const pkFields = table.fields.filter(f => f.isPrimaryKey);
  if (pkFields.length > 0) {
    const cols = pkFields.map(f => quoteIdent(f.name)).join(', ');
    lines.push(`  PRIMARY KEY (${cols})`);
  }

  // 表级约束（UNIQUE / CHECK），列定义 + PRIMARY KEY 之后追加
  for (const c of table.constraints ?? []) {
    const line = renderTableConstraintInline(c, table);
    if (line) lines.push(`  ${line}`);
  }

  return `CREATE TABLE ${qualified(table.schema, table.name)} (\n${lines.join(',\n')}\n);`;
}

// ==================== 表级约束 ====================

/** 缺省约束名前缀；UNIQUE 拼字段，CHECK 用短哈希避免重名，EXCLUDE 拼字段或哈希表达式 */
function defaultConstraintName(c: TableConstraint, table: TableDefinition): string {
  if (c.kind === 'UNIQUE') {
    const cols = (c.fieldIds ?? [])
      .map(id => table.fields.find(f => f.id === id)?.name)
      .filter(Boolean)
      .join('_');
    return `uq_${table.name}_${cols || 'unique'}`;
  }
  if (c.kind === 'EXCLUDE') {
    const tokens = (c.exclusionElements ?? []).map(el => {
      if (el.fieldId) {
        return table.fields.find(f => f.id === el.fieldId)?.name ?? 'expr';
      }
      return shortHash(el.expression ?? 'expr');
    });
    return `ex_${table.name}_${tokens.join('_') || 'exclude'}`;
  }
  // CHECK
  return `chk_${table.name}_${shortHash(c.expression ?? c.id)}`;
}

/** 简短稳定哈希（djb2 变体）；仅作为约束名后缀，避免不同表达式撞名 */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36).slice(0, 6);
}

/** 渲染 CREATE TABLE 内联的表级约束行；引用不存在的字段或表达式为空时返回 null */
export function renderTableConstraintInline(
  c: TableConstraint,
  table: TableDefinition
): string | null {
  const name = c.name?.trim() || defaultConstraintName(c, table);
  if (c.kind === 'UNIQUE') {
    const cols = (c.fieldIds ?? [])
      .map(id => table.fields.find(f => f.id === id))
      .filter((f): f is FieldDefinition => !!f)
      .map(f => quoteIdent(f.name));
    if (cols.length < 1) return null; // 至少 1 列；UI 强制 2+，但宽容渲染
    return `CONSTRAINT ${quoteIdent(name)} UNIQUE (${cols.join(', ')})`;
  }
  if (c.kind === 'EXCLUDE') {
    return renderExclusionConstraintInline(c, table, name);
  }
  const expr = c.expression?.trim();
  if (!expr) return null;
  return `CONSTRAINT ${quoteIdent(name)} CHECK (${expr})`;
}

/** 渲染 EXCLUDE 约束（含 USING、元素、WHERE、DEFERRABLE 等） */
function renderExclusionConstraintInline(
  c: TableConstraint,
  table: TableDefinition,
  name: string
): string | null {
  const elements = c.exclusionElements ?? [];
  if (elements.length === 0) return null;

  const using = c.exclusionUsing ?? 'GIST';
  const renderedElements = elements
    .map(el => {
      const head = el.fieldId
        ? quoteIdent(table.fields.find(f => f.id === el.fieldId)?.name ?? '')
        : (el.expression ?? '').trim();
      if (!head || !el.operator?.trim()) return null;
      return `${head} WITH ${el.operator.trim()}`;
    })
    .filter((e): e is string => !!e);
  if (renderedElements.length === 0) return null;

  const where = c.exclusionWhere?.trim() ? ` WHERE (${c.exclusionWhere.trim()})` : '';
  const deferrable = c.exclusionDeferrable
    ? c.exclusionInitiallyDeferred
      ? ' DEFERRABLE INITIALLY DEFERRED'
      : ' DEFERRABLE'
    : '';
  return `CONSTRAINT ${quoteIdent(name)} EXCLUDE USING ${using} (${renderedElements.join(', ')})${where}${deferrable}`;
}

/** ALTER TABLE 形式的表级约束（用于 diff 生成 ADD CONSTRAINT 语句） */
export function renderTableConstraintAlter(
  c: TableConstraint,
  table: TableDefinition
): string | null {
  const line = renderTableConstraintInline(c, table);
  if (!line) return null;
  return `ALTER TABLE ${qualified(table.schema, table.name)} ADD ${line};`;
}

/** 取约束的最终落地名（缺省时返回工具推断的名字，供 diff 按 name 匹配） */
export function resolveConstraintName(c: TableConstraint, table: TableDefinition): string {
  return c.name?.trim() || defaultConstraintName(c, table);
}

// ==================== ALTER TABLE ADD FOREIGN KEY ====================

/** 仅在非默认动作时输出 ON DELETE/UPDATE 子句 */
function renderFkAction(keyword: string, action: FkAction): string {
  return action && action !== 'NO ACTION' ? ` ${keyword} ${action}` : '';
}

function generateForeignKeyStatements(tables: TableDefinition[]): string[] {
  const byId = new Map(tables.map(t => [t.id, t]));
  const statements: string[] = [];

  for (const table of tables) {
    for (const field of table.fields) {
      const fk = field.foreignKey;
      if (!fk) continue;

      const refTable = byId.get(fk.referenceTableId);
      if (!refTable) continue;
      const refField = refTable.fields.find(f => f.id === fk.referenceFieldId);
      if (!refField) continue;

      const constraintName = fk.constraintName?.trim() || `fk_${table.name}_${field.name}`;
      const onDelete = renderFkAction('ON DELETE', fk.onDelete);
      const onUpdate = renderFkAction('ON UPDATE', fk.onUpdate);

      statements.push(
        `ALTER TABLE ${qualified(table.schema, table.name)} ` +
          `ADD CONSTRAINT ${quoteIdent(constraintName)} ` +
          `FOREIGN KEY (${quoteIdent(field.name)}) ` +
          `REFERENCES ${qualified(refTable.schema, refTable.name)} (${quoteIdent(refField.name)})` +
          `${onDelete}${onUpdate};`
      );
    }
  }

  return statements;
}

// ==================== CREATE INDEX ====================

/** 渲染一个索引列：字段/表达式 + opclass + 方向 + NULLS */
function renderIndexColumn(col: IndexColumn, fields: FieldDefinition[]): string | null {
  let head: string;
  if (col.fieldId) {
    const f = fields.find(ff => ff.id === col.fieldId);
    if (!f) return null;
    head = quoteIdent(f.name);
  } else {
    const expr = col.expression?.trim();
    if (!expr) return null;
    head = expr;
  }

  const parts = [head];
  if (col.opclass?.trim()) parts.push(col.opclass.trim());
  const tail: string[] = [];
  // ASC 是默认值，不显式输出，保持 SQL 简洁
  if (col.direction === 'DESC') tail.push('DESC');
  if (col.nulls) tail.push(`NULLS ${col.nulls}`);
  return tail.length ? `${parts.join(' ')} ${tail.join(' ')}` : parts.join(' ');
}

/** 自动索引名：idx_<table>_<col1>_<col2>...；UNIQUE 时前缀 uq_；表达式列取首词或哈希 */
export function autoIndexName(idx: IndexDefinition, table: TableDefinition): string {
  const tokens = idx.columns.map(col => {
    if (col.fieldId) {
      return table.fields.find(f => f.id === col.fieldId)?.name ?? 'col';
    }
    const expr = (col.expression ?? '').trim();
    const firstWord = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/)?.[0];
    return firstWord ?? shortHash(expr || 'expr');
  });
  const prefix = idx.isUnique ? 'uq' : 'idx';
  return `${prefix}_${table.name}_${tokens.join('_') || 'idx'}`;
}

/** 渲染单条 CREATE INDEX 语句；若全部列都解析不出 → 返回 null */
export function renderCreateIndex(idx: IndexDefinition, table: TableDefinition): string | null {
  const cols = idx.columns
    .map(c => renderIndexColumn(c, table.fields))
    .filter((s): s is string => !!s);
  if (cols.length === 0) return null;

  const name = idx.name?.trim() || autoIndexName(idx, table);
  const using = idx.indexType && idx.indexType !== 'BTREE' ? ` USING ${idx.indexType}` : '';
  const include = idx.include?.length
    ? ` INCLUDE (${idx.include.map(quoteIdent).join(', ')})`
    : '';
  const where = idx.predicate?.trim() ? ` WHERE ${idx.predicate.trim()}` : '';
  const unique = idx.isUnique ? 'UNIQUE ' : '';

  return (
    `CREATE ${unique}INDEX ${quoteIdent(name)} ` +
    `ON ${qualified(table.schema, table.name)}${using} (${cols.join(', ')})${include}${where};`
  );
}

function generateIndexStatements(tables: TableDefinition[]): string[] {
  const statements: string[] = [];
  for (const table of tables) {
    for (const index of table.indexes ?? []) {
      const sql = renderCreateIndex(index, table);
      if (sql) statements.push(sql);
    }
  }
  return statements;
}

// ==================== COMMENT ON ====================

function generateCommentStatements(tables: TableDefinition[]): string[] {
  const statements: string[] = [];

  for (const table of tables) {
    if (table.comment && table.comment.trim()) {
      statements.push(
        `COMMENT ON TABLE ${qualified(table.schema, table.name)} IS ${quoteLiteral(table.comment)};`
      );
    }
    for (const field of table.fields) {
      if (field.comment && field.comment.trim()) {
        statements.push(
          `COMMENT ON COLUMN ${qualified(table.schema, table.name)}.${quoteIdent(field.name)} ` +
            `IS ${quoteLiteral(field.comment)};`
        );
      }
    }
  }

  return statements;
}

// ==================== 对外 API ====================

export interface DdlSections {
  enums: string[];
  tables: string[];
  foreignKeys: string[];
  indexes: string[];
  comments: string[];
}

/**
 * 按执行顺序分组生成 DDL：
 * 1. CREATE TYPE → 2. CREATE TABLE（拓扑排序）→ 3. ADD FOREIGN KEY → 4. CREATE INDEX → 5. COMMENT
 */
export function generateDdlSections(project: ProjectFile): DdlSections {
  const sortedTables = topologicalSortTables(project.tables);
  const enums = project.enums ?? [];

  return {
    enums: generateEnumStatements(enums),
    tables: sortedTables.map(t => generateCreateTableStatement(t, enums)),
    foreignKeys: generateForeignKeyStatements(sortedTables),
    indexes: generateIndexStatements(sortedTables),
    comments: generateCommentStatements(sortedTables),
  };
}

/** 扁平的有序语句数组 —— 用于 POST /api/schema/execute 的 payload */
export function generateDdlStatements(project: ProjectFile): string[] {
  const s = generateDdlSections(project);
  return [...s.enums, ...s.tables, ...s.foreignKeys, ...s.indexes, ...s.comments];
}

/** 带分节注释的完整 SQL 文本 —— 用于预览弹窗与 .sql 文件下载 */
export function generateProjectDdl(project: ProjectFile): string {
  const s = generateDdlSections(project);
  const blocks: string[] = [];

  const header = [
    `-- ${project.name}`,
    project.description ? `-- ${project.description}` : null,
    `-- Generated at ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');
  blocks.push(header);

  const addSection = (title: string, statements: string[]) => {
    if (statements.length === 0) return;
    blocks.push(`-- ${title}\n${statements.join('\n')}`);
  };

  addSection('ENUM 类型', s.enums);
  addSection('数据表', s.tables);
  addSection('外键约束', s.foreignKeys);
  addSection('索引', s.indexes);
  addSection('注释', s.comments);

  return blocks.join('\n\n') + '\n';
}
