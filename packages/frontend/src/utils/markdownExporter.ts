import type {
  EnumType,
  FieldDefinition,
  IndexDefinition,
  TableConstraint,
  TableDefinition,
} from '@/types/schema';
import { typeHasLength, typeHasPrecision } from './typeDefinitions';

const BOOL_YES = '是';
const BOOL_NO = '否';
const EMPTY = '—';

/** 将单元格内容中的换行折叠为空格，并转义竖线。 */
function escapeCell(value: string | undefined | null): string {
  if (value == null) return EMPTY;
  const s = String(value).replace(/\r?\n/g, ' ').trim();
  if (s === '') return EMPTY;
  return s.replace(/\|/g, '\\|');
}

function bool(v: boolean | undefined): string {
  return v ? BOOL_YES : BOOL_NO;
}

/** 渲染字段类型字符串：与 FieldTypeSelect / sqlGenerator 的展示口径保持一致。 */
function renderFieldType(field: FieldDefinition, enums: EnumType[]): string {
  let base: string;
  if (field.type === 'USER-DEFINED') {
    const e = enums.find(x => x.id === field.enumTypeId);
    base = e ? `${e.schema}.${e.name}` : 'USER-DEFINED';
  } else if (typeHasLength(field.type) && field.length) {
    base = `${field.type}(${field.length})`;
  } else if (typeHasPrecision(field.type) && field.precision) {
    base = field.scale != null
      ? `${field.type}(${field.precision}, ${field.scale})`
      : `${field.type}(${field.precision})`;
  } else {
    base = String(field.type);
  }
  return field.isArray ? `${base}[]` : base;
}

/** 把外键描述渲染为 `schema.table.column ON DELETE … ON UPDATE …`，找不到引用时退化展示原始 ID。 */
function renderForeignKey(field: FieldDefinition, allTables: TableDefinition[]): string {
  const fk = field.foreignKey;
  if (!fk) return '';
  const target = allTables.find(t => t.id === fk.referenceTableId);
  const targetField = target?.fields.find(f => f.id === fk.referenceFieldId);
  const head = target && targetField
    ? `${target.schema}.${target.name}.${targetField.name}`
    : `${fk.referenceTableId}.${fk.referenceFieldId}`;
  const tail: string[] = [];
  if (fk.onDelete && fk.onDelete !== 'NO ACTION') tail.push(`ON DELETE ${fk.onDelete}`);
  if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') tail.push(`ON UPDATE ${fk.onUpdate}`);
  return tail.length ? `${head} ${tail.join(' ')}` : head;
}

/** CHECK 与 IDENTITY 合并到「列约束」列。 */
function renderColumnConstraint(field: FieldDefinition): string {
  const parts: string[] = [];
  if (field.checkConstraint?.trim()) parts.push(`CHECK (${field.checkConstraint.trim()})`);
  if (field.identity) parts.push(`IDENTITY ${field.identity}`);
  return parts.join('; ');
}

function buildRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`;
}

function buildTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(buildRow).join('\n');
  return [head, sep, body].join('\n');
}

// ==================== 字段表 ====================

function renderFieldsTable(table: TableDefinition, enums: EnumType[], allTables: TableDefinition[]): string {
  const headers = ['字段名', '类型', '可空', 'PK', '唯一', '默认值', '外键', '列约束', '注释'];
  const rows = table.fields
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(f => [
      f.name,
      renderFieldType(f, enums),
      bool(f.nullable),
      bool(f.isPrimaryKey),
      bool(f.isUnique),
      f.defaultValue ?? '',
      renderForeignKey(f, allTables),
      renderColumnConstraint(f),
      f.comment ?? '',
    ]);
  return buildTable(headers, rows);
}

// ==================== 约束表 ====================

function renderConstraintDefinition(c: TableConstraint, fieldName: (id: string) => string): string {
  if (c.kind === 'UNIQUE') {
    return `(${(c.fieldIds ?? []).map(fieldName).join(', ')})`;
  }
  if (c.kind === 'CHECK') {
    return `(${c.expression ?? ''})`;
  }
  const els = (c.exclusionElements ?? [])
    .map(el => {
      const head = el.fieldId ? fieldName(el.fieldId) : (el.expression ?? '');
      return `${head} WITH ${el.operator}`;
    })
    .join(', ');
  const where = c.exclusionWhere?.trim() ? ` WHERE (${c.exclusionWhere.trim()})` : '';
  return `USING ${c.exclusionUsing ?? 'GIST'} (${els})${where}`;
}

function renderConstraintsTable(table: TableDefinition): string | null {
  const constraints = table.constraints ?? [];
  if (constraints.length === 0) return null;
  const fieldName = (id: string) => table.fields.find(f => f.id === id)?.name ?? id;
  const headers = ['名称', '类型', '定义', '注释'];
  const rows = constraints.map(c => [
    c.name ?? '(自动命名)',
    c.kind,
    renderConstraintDefinition(c, fieldName),
    c.comment ?? '',
  ]);
  return buildTable(headers, rows);
}

// ==================== 索引表 ====================

function renderIndexColumns(idx: IndexDefinition, fieldName: (id?: string) => string): string {
  return idx.columns
    .map(c => {
      const head = c.fieldId ? fieldName(c.fieldId) : (c.expression ?? '');
      const op = c.opclass ? ` ${c.opclass}` : '';
      const dir = c.direction === 'DESC' ? ' DESC' : '';
      const nulls = c.nulls ? ` NULLS ${c.nulls}` : '';
      return `${head}${op}${dir}${nulls}`;
    })
    .join(', ');
}

function renderIndexesTable(table: TableDefinition): string | null {
  const indexes = table.indexes ?? [];
  if (indexes.length === 0) return null;
  const fieldName = (id?: string) => (id ? table.fields.find(f => f.id === id)?.name ?? id : '');
  const headers = ['名称', '索引类型', 'UNIQUE', '列', 'WHERE', 'INCLUDE', '注释'];
  const rows = indexes.map(idx => [
    idx.name?.trim() || '(自动命名)',
    idx.indexType ?? 'BTREE',
    bool(idx.isUnique),
    `(${renderIndexColumns(idx, fieldName)})`,
    idx.predicate?.trim() ?? '',
    (idx.include ?? []).join(', '),
    idx.comment ?? '',
  ]);
  return buildTable(headers, rows);
}

// ==================== 入口 ====================

/**
 * 将单张表导出为 Markdown。
 * - H1 标题：`schema.name`
 * - 表注释作为引用块附在标题下
 * - 字段表恒定输出；约束 / 索引若不存在则跳过
 */
export function tableToMarkdown(
  table: TableDefinition,
  enums: EnumType[],
  allTables: TableDefinition[]
): string {
  const sections: string[] = [];
  // 标题区域用 blockquote 包裹（多数 Markdown 渲染器会绘制底色 + 左侧色条）；
  // 注释作为「中文表名」另起一行附在英文表名下方。
  const headerLines: string[] = [`# ${table.schema}.${table.name}`];
  if (table.comment?.trim()) headerLines.push(table.comment.trim());
  sections.push(headerLines.map(l => `> ${l}`).join('\n>\n'));

  sections.push(`## (${table.fields.length})`);
  sections.push(renderFieldsTable(table, enums, allTables));

  const constraintsMd = renderConstraintsTable(table);
  if (constraintsMd) {
    sections.push(`## 约束 (${table.constraints?.length ?? 0})`);
    sections.push(constraintsMd);
  }

  const indexesMd = renderIndexesTable(table);
  if (indexesMd) {
    sections.push(`## 索引 (${table.indexes.length})`);
    sections.push(indexesMd);
  }

  return sections.join('\n\n') + '\n';
}

// 仅供测试：内部辅助导出
export const __test__ = { renderFieldType, renderForeignKey, renderColumnConstraint };
