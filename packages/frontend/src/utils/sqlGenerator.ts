import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  FkAction,
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
  if (field.defaultValue != null && field.defaultValue !== '') {
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

  return `CREATE TABLE ${qualified(table.schema, table.name)} (\n${lines.join(',\n')}\n);`;
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

function generateIndexStatements(tables: TableDefinition[]): string[] {
  const statements: string[] = [];

  for (const table of tables) {
    for (const index of table.indexes ?? []) {
      const fields = index.fieldIds
        .map(id => table.fields.find(f => f.id === id))
        .filter((f): f is FieldDefinition => !!f);
      if (fields.length === 0) continue;

      const unique = index.isUnique ? 'UNIQUE ' : '';
      // BTREE 是默认方法，省略 USING 让语句更简洁
      const using =
        index.indexType && index.indexType !== 'BTREE' ? ` USING ${index.indexType}` : '';
      const cols = fields.map(f => quoteIdent(f.name)).join(', ');

      statements.push(
        `CREATE ${unique}INDEX ${quoteIdent(index.name)} ` +
          `ON ${qualified(table.schema, table.name)}${using} (${cols});`
      );
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
