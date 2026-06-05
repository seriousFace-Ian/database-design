import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  IndexDefinition,
  FkAction,
  TableConstraint,
} from '@/types/schema';
import { typeHasLength, typeHasPrecision } from './typeDefinitions';
import { renderTableConstraintInline, resolveConstraintName } from './sqlGenerator';

// ==================== 基础工具（与 sqlGenerator 同源，重复以避免循环依赖） ====================

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
function qualified(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderFieldType(field: FieldDefinition, enums: EnumType[]): string {
  let base: string;
  if (field.type === 'USER-DEFINED') {
    const enumDef = enums.find(e => e.id === field.enumTypeId);
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

function renderFkAction(keyword: string, action: FkAction): string {
  return action && action !== 'NO ACTION' ? ` ${keyword} ${action}` : '';
}

// ==================== 字段「规范化」用于比较 ====================

interface NormalizedField {
  name: string;
  typeText: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  comment: string | null;
}

function normalizeField(field: FieldDefinition, enums: EnumType[]): NormalizedField {
  return {
    name: field.name,
    typeText: renderFieldType(field, enums),
    nullable: !!field.nullable,
    isPrimaryKey: !!field.isPrimaryKey,
    isUnique: !!field.isUnique,
    defaultValue: field.defaultValue?.trim() ? field.defaultValue.trim() : null,
    comment: field.comment?.trim() ? field.comment.trim() : null,
  };
}

// ==================== 索引/外键 规范化 ====================

interface NormalizedFk {
  constraintName: string;
  columnName: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
  onDelete: FkAction;
  onUpdate: FkAction;
}

function normalizeFk(
  field: FieldDefinition,
  tableName: string,
  tables: TableDefinition[]
): NormalizedFk | null {
  const fk = field.foreignKey;
  if (!fk) return null;
  const refTable = tables.find(t => t.id === fk.referenceTableId);
  if (!refTable) return null;
  const refField = refTable.fields.find(f => f.id === fk.referenceFieldId);
  if (!refField) return null;
  return {
    constraintName: fk.constraintName?.trim() || `fk_${tableName}_${field.name}`,
    columnName: field.name,
    refSchema: refTable.schema,
    refTable: refTable.name,
    refColumn: refField.name,
    onDelete: fk.onDelete,
    onUpdate: fk.onUpdate,
  };
}

interface NormalizedIndexColumn {
  text: string;          // "name", LOWER(name), 等
  opclass?: string;
  direction?: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

interface NormalizedIndex {
  name: string;
  columns: NormalizedIndexColumn[];
  isUnique: boolean;
  indexType: string;
  predicate?: string;
  include?: string[];
}

function normalizeIndex(index: IndexDefinition, table: TableDefinition): NormalizedIndex | null {
  const columns: NormalizedIndexColumn[] = [];
  for (const col of index.columns ?? []) {
    let text: string;
    if (col.fieldId) {
      const name = table.fields.find(f => f.id === col.fieldId)?.name;
      if (!name) continue;
      text = name;
    } else {
      const expr = col.expression?.trim();
      if (!expr) continue;
      text = expr;
    }
    columns.push({
      text,
      opclass: col.opclass?.trim() || undefined,
      direction: col.direction === 'DESC' ? 'DESC' : undefined,
      nulls: col.nulls,
    });
  }
  if (columns.length === 0) return null;
  return {
    name: index.name,
    columns,
    isUnique: index.isUnique,
    indexType: (index.indexType ?? 'BTREE').toUpperCase(),
    predicate: index.predicate?.trim() || undefined,
    include: index.include?.length ? [...index.include] : undefined,
  };
}

// ==================== 差异结构 ====================

export interface FieldChange {
  field: string;
  changes: Partial<{
    type: { from: string; to: string };
    nullable: { from: boolean; to: boolean };
    default: { from: string | null; to: string | null };
    comment: { from: string | null; to: string | null };
    unique: { from: boolean; to: boolean };
  }>;
}

export interface TableConstraintChange {
  /** target 端的 TableDefinition；在 ALTER 渲染时用来引用 fields */
  table: TableDefinition;
  constraint: TableConstraint;
  /** 缺省名时由 resolveConstraintName 推断；diff key 用这个 */
  resolvedName: string;
}

export interface TableModification {
  schema: string;
  name: string;
  columnsAdded: FieldDefinition[];
  columnsDropped: string[];
  columnsModified: FieldChange[];
  fksAdded: NormalizedFk[];
  fksDropped: NormalizedFk[];
  indexesAdded: NormalizedIndex[];
  indexesDropped: NormalizedIndex[];
  tableConstraintsAdded: TableConstraintChange[];
  tableConstraintsDropped: { name: string }[];
  commentChanged: { from: string | null; to: string | null } | null;
  pkChanged: { from: string[]; to: string[] } | null;
}

export interface SchemaDiff {
  enums: {
    added: EnumType[];
    dropped: { schema: string; name: string }[];
    valuesAdded: { schema: string; name: string; values: string[] }[];
  };
  tables: {
    added: TableDefinition[];
    dropped: { schema: string; name: string }[];
    modified: TableModification[];
  };
}

// ==================== 主 diff 函数 ====================

const tableKey = (schema: string, name: string) => `${schema}.${name}`;
const enumKey = (schema: string, name: string) => `${schema}.${name}`;

/**
 * 把 current（数据库现状，已转 ProjectFile）与 target（设计）做差异分析。
 * - 按 schema.name 匹配表/ENUM
 * - 按字段名匹配列
 * - 按 constraintName 匹配外键（回退按 columnName）
 * - 按 index.name 匹配索引
 */
export function computeSchemaDiff(current: ProjectFile, target: ProjectFile): SchemaDiff {
  // -------- ENUM --------
  const currentEnumMap = new Map(current.enums.map(e => [enumKey(e.schema, e.name), e]));
  const targetEnumMap = new Map(target.enums.map(e => [enumKey(e.schema, e.name), e]));

  const enumsAdded: EnumType[] = [];
  const valuesAdded: { schema: string; name: string; values: string[] }[] = [];
  for (const [k, t] of targetEnumMap) {
    const c = currentEnumMap.get(k);
    if (!c) {
      enumsAdded.push(t);
    } else {
      const existing = new Set(c.values);
      const extras = t.values.filter(v => !existing.has(v));
      if (extras.length > 0) {
        valuesAdded.push({ schema: t.schema, name: t.name, values: extras });
      }
    }
  }
  const enumsDropped = [...currentEnumMap.entries()]
    .filter(([k]) => !targetEnumMap.has(k))
    .map(([, e]) => ({ schema: e.schema, name: e.name }));

  // -------- Tables --------
  const currentTableMap = new Map(current.tables.map(t => [tableKey(t.schema, t.name), t]));
  const targetTableMap = new Map(target.tables.map(t => [tableKey(t.schema, t.name), t]));

  const tablesAdded: TableDefinition[] = [];
  const tablesModified: TableModification[] = [];
  for (const [k, tgt] of targetTableMap) {
    const cur = currentTableMap.get(k);
    if (!cur) {
      tablesAdded.push(tgt);
    } else {
      const mod = diffTable(cur, tgt, current.enums, target.enums, current.tables, target.tables);
      if (modificationIsEmpty(mod)) continue;
      tablesModified.push(mod);
    }
  }
  const tablesDropped = [...currentTableMap.entries()]
    .filter(([k]) => !targetTableMap.has(k))
    .map(([, t]) => ({ schema: t.schema, name: t.name }));

  return {
    enums: { added: enumsAdded, dropped: enumsDropped, valuesAdded },
    tables: { added: tablesAdded, dropped: tablesDropped, modified: tablesModified },
  };
}

function modificationIsEmpty(m: TableModification): boolean {
  return (
    m.columnsAdded.length === 0 &&
    m.columnsDropped.length === 0 &&
    m.columnsModified.length === 0 &&
    m.fksAdded.length === 0 &&
    m.fksDropped.length === 0 &&
    m.indexesAdded.length === 0 &&
    m.indexesDropped.length === 0 &&
    m.tableConstraintsAdded.length === 0 &&
    m.tableConstraintsDropped.length === 0 &&
    !m.commentChanged &&
    !m.pkChanged
  );
}

/** 把一个 TableConstraint 规范化为可比较的字符串签名（用来判定"同名但定义变更"）*/
function constraintSignature(c: TableConstraint, table: TableDefinition): string {
  if (c.kind === 'UNIQUE') {
    const cols = (c.fieldIds ?? [])
      .map(id => table.fields.find(f => f.id === id)?.name ?? '?')
      .join(',');
    return `UNIQUE(${cols})`;
  }
  if (c.kind === 'CHECK') {
    return `CHECK(${(c.expression ?? '').trim()})`;
  }
  // EXCLUDE
  const els = (c.exclusionElements ?? []).map(el => {
    const head = el.fieldId
      ? table.fields.find(f => f.id === el.fieldId)?.name ?? '?'
      : (el.expression ?? '').trim();
    return `${head}#${el.operator.trim()}`;
  }).join(',');
  const where = (c.exclusionWhere ?? '').trim();
  const using = c.exclusionUsing ?? 'GIST';
  const defer = `${c.exclusionDeferrable ? 'D' : ''}${c.exclusionInitiallyDeferred ? 'I' : ''}`;
  return `EXCLUDE(${using};${els};WHERE=${where};${defer})`;
}

function diffTable(
  cur: TableDefinition,
  tgt: TableDefinition,
  curEnums: EnumType[],
  tgtEnums: EnumType[],
  curTables: TableDefinition[],
  tgtTables: TableDefinition[]
): TableModification {
  // 字段：按 name 匹配
  const curFieldMap = new Map(cur.fields.map(f => [f.name, f]));
  const tgtFieldMap = new Map(tgt.fields.map(f => [f.name, f]));

  const columnsAdded: FieldDefinition[] = [];
  const columnsDropped: string[] = [];
  const columnsModified: FieldChange[] = [];

  for (const [name, tField] of tgtFieldMap) {
    const cField = curFieldMap.get(name);
    if (!cField) {
      columnsAdded.push(tField);
      continue;
    }
    const cn = normalizeField(cField, curEnums);
    const tn = normalizeField(tField, tgtEnums);
    const changes: FieldChange['changes'] = {};
    if (cn.typeText !== tn.typeText) changes.type = { from: cn.typeText, to: tn.typeText };
    if (cn.nullable !== tn.nullable) changes.nullable = { from: cn.nullable, to: tn.nullable };
    if (cn.defaultValue !== tn.defaultValue) changes.default = { from: cn.defaultValue, to: tn.defaultValue };
    if (cn.comment !== tn.comment) changes.comment = { from: cn.comment, to: tn.comment };
    if (cn.isUnique !== tn.isUnique) changes.unique = { from: cn.isUnique, to: tn.isUnique };
    if (Object.keys(changes).length > 0) columnsModified.push({ field: name, changes });
  }
  for (const name of curFieldMap.keys()) {
    if (!tgtFieldMap.has(name)) columnsDropped.push(name);
  }

  // PK：按字段名集合比较
  const curPk = cur.fields.filter(f => f.isPrimaryKey).map(f => f.name).sort();
  const tgtPk = tgt.fields.filter(f => f.isPrimaryKey).map(f => f.name).sort();
  const pkChanged =
    JSON.stringify(curPk) !== JSON.stringify(tgtPk) ? { from: curPk, to: tgtPk } : null;

  // FK：按 constraintName 匹配；落空时按 columnName
  const curFks = cur.fields
    .map(f => normalizeFk(f, cur.name, curTables))
    .filter((x): x is NormalizedFk => !!x);
  const tgtFks = tgt.fields
    .map(f => normalizeFk(f, tgt.name, tgtTables))
    .filter((x): x is NormalizedFk => !!x);
  const curFkMap = new Map(curFks.map(fk => [fkKey(fk), fk]));
  const tgtFkMap = new Map(tgtFks.map(fk => [fkKey(fk), fk]));

  const fksAdded: NormalizedFk[] = [];
  const fksDropped: NormalizedFk[] = [];
  for (const [k, fk] of tgtFkMap) if (!curFkMap.has(k)) fksAdded.push(fk);
  for (const [k, fk] of curFkMap) if (!tgtFkMap.has(k)) fksDropped.push(fk);
  // 同 key 但定义不同 → 视为先 drop 再 add，确保 ON DELETE 等变更生效
  for (const [k, tFk] of tgtFkMap) {
    const cFk = curFkMap.get(k);
    if (!cFk) continue;
    if (fkDefinitionEqual(cFk, tFk)) continue;
    fksDropped.push(cFk);
    fksAdded.push(tFk);
  }

  // Indexes：按 name 匹配
  const curIdx = (cur.indexes ?? [])
    .map(i => normalizeIndex(i, cur))
    .filter((x): x is NormalizedIndex => !!x);
  const tgtIdx = (tgt.indexes ?? [])
    .map(i => normalizeIndex(i, tgt))
    .filter((x): x is NormalizedIndex => !!x);
  const curIdxMap = new Map(curIdx.map(i => [i.name, i]));
  const tgtIdxMap = new Map(tgtIdx.map(i => [i.name, i]));

  const indexesAdded: NormalizedIndex[] = [];
  const indexesDropped: NormalizedIndex[] = [];
  for (const [k, idx] of tgtIdxMap) if (!curIdxMap.has(k)) indexesAdded.push(idx);
  for (const [k, idx] of curIdxMap) if (!tgtIdxMap.has(k)) indexesDropped.push(idx);
  for (const [k, tIdx] of tgtIdxMap) {
    const cIdx = curIdxMap.get(k);
    if (!cIdx) continue;
    if (indexDefinitionEqual(cIdx, tIdx)) continue;
    indexesDropped.push(cIdx);
    indexesAdded.push(tIdx);
  }

  // 表级约束：按 resolvedName 匹配；同名定义不同 → drop + add
  const curConstraints = cur.constraints ?? [];
  const tgtConstraints = tgt.constraints ?? [];
  const curConstraintMap = new Map(
    curConstraints.map(c => [resolveConstraintName(c, cur), { c, sig: constraintSignature(c, cur) }])
  );
  const tgtConstraintMap = new Map(
    tgtConstraints.map(c => [resolveConstraintName(c, tgt), { c, sig: constraintSignature(c, tgt) }])
  );

  const tableConstraintsAdded: TableConstraintChange[] = [];
  const tableConstraintsDropped: { name: string }[] = [];

  for (const [name, { c, sig }] of tgtConstraintMap) {
    const curEntry = curConstraintMap.get(name);
    if (!curEntry) {
      tableConstraintsAdded.push({ table: tgt, constraint: c, resolvedName: name });
    } else if (curEntry.sig !== sig) {
      tableConstraintsDropped.push({ name });
      tableConstraintsAdded.push({ table: tgt, constraint: c, resolvedName: name });
    }
  }
  for (const [name] of curConstraintMap) {
    if (!tgtConstraintMap.has(name)) tableConstraintsDropped.push({ name });
  }

  // 表注释
  const curComment = cur.comment?.trim() ? cur.comment.trim() : null;
  const tgtComment = tgt.comment?.trim() ? tgt.comment.trim() : null;
  const commentChanged =
    curComment !== tgtComment ? { from: curComment, to: tgtComment } : null;

  return {
    schema: tgt.schema,
    name: tgt.name,
    columnsAdded,
    columnsDropped,
    columnsModified,
    fksAdded,
    fksDropped,
    indexesAdded,
    indexesDropped,
    tableConstraintsAdded,
    tableConstraintsDropped,
    commentChanged,
    pkChanged,
  };
}

function fkKey(fk: NormalizedFk): string {
  return fk.constraintName;
}
function fkDefinitionEqual(a: NormalizedFk, b: NormalizedFk): boolean {
  return (
    a.columnName === b.columnName &&
    a.refSchema === b.refSchema &&
    a.refTable === b.refTable &&
    a.refColumn === b.refColumn &&
    a.onDelete === b.onDelete &&
    a.onUpdate === b.onUpdate
  );
}
function indexDefinitionEqual(a: NormalizedIndex, b: NormalizedIndex): boolean {
  if (a.isUnique !== b.isUnique) return false;
  if (a.indexType !== b.indexType) return false;
  if ((a.predicate ?? '') !== (b.predicate ?? '')) return false;
  if ((a.include?.join('|') ?? '') !== (b.include?.join('|') ?? '')) return false;
  if (a.columns.length !== b.columns.length) return false;
  return a.columns.every((c, i) => {
    const o = b.columns[i];
    return (
      c.text === o.text &&
      (c.opclass ?? '') === (o.opclass ?? '') &&
      (c.direction ?? 'ASC') === (o.direction ?? 'ASC') &&
      (c.nulls ?? '') === (o.nulls ?? '')
    );
  });
}

// ==================== Diff → SQL ====================

export interface DiffSqlSections {
  enumDrops: string[];           // 必须在表 drop 之前？反之亦然？这里放在 table drop 之后
  tableDrops: string[];          // DROP TABLE CASCADE
  enumCreates: string[];         // CREATE TYPE
  enumAlters: string[];          // ALTER TYPE ADD VALUE
  tableCreates: string[];        // CREATE TABLE + 其自身 FK/index/comment
  alters: string[];              // ALTER TABLE ... ADD/DROP/ALTER COLUMN/CONSTRAINT
  comments: string[];            // COMMENT ON ...
}

/**
 * 将 SchemaDiff 转为有序的 ALTER 语句。
 * 执行顺序（设计）：
 *   1. DROP FK / DROP INDEX（来自 modified 表）
 *   2. DROP TABLE CASCADE
 *   3. DROP TYPE
 *   4. CREATE TYPE / ALTER TYPE ADD VALUE
 *   5. CREATE TABLE（被引用表优先 — 此处沿用 target 中的顺序，调用方应已拓扑排序）
 *   6. ALTER TABLE ADD COLUMN / ALTER COLUMN / DROP COLUMN / 新增 PK
 *   7. ADD FK
 *   8. CREATE INDEX
 *   9. COMMENT
 */
export function renderDiffSql(
  diff: SchemaDiff,
  targetEnums: EnumType[],
  targetTables: TableDefinition[] = []
): DiffSqlSections {
  const sections: DiffSqlSections = {
    enumDrops: [],
    tableDrops: [],
    enumCreates: [],
    enumAlters: [],
    tableCreates: [],
    alters: [],
    comments: [],
  };

  // --- 表 drop ---
  for (const t of diff.tables.dropped) {
    sections.tableDrops.push(`DROP TABLE ${qualified(t.schema, t.name)} CASCADE;`);
  }

  // --- ENUM drop / create / add value ---
  for (const e of diff.enums.dropped) {
    sections.enumDrops.push(`DROP TYPE ${qualified(e.schema, e.name)};`);
  }
  for (const e of diff.enums.added) {
    const values = e.values.map(quoteLiteral).join(', ');
    sections.enumCreates.push(`CREATE TYPE ${qualified(e.schema, e.name)} AS ENUM (${values});`);
  }
  for (const e of diff.enums.valuesAdded) {
    for (const v of e.values) {
      sections.enumAlters.push(
        `ALTER TYPE ${qualified(e.schema, e.name)} ADD VALUE IF NOT EXISTS ${quoteLiteral(v)};`
      );
    }
  }

  // --- 新增表：CREATE TABLE + INDEX + COMMENT（FK 留到所有表创建完毕后统一追加） ---
  for (const t of diff.tables.added) {
    sections.tableCreates.push(...renderCreateTableBlock(t, targetEnums));
  }
  // 新增表的 FK 必须使用完整 target.tables 解析跨表引用；放在所有 CREATE TABLE 之后
  const lookupTables = targetTables.length > 0 ? targetTables : diff.tables.added;
  for (const t of diff.tables.added) {
    for (const f of t.fields) {
      const fk = normalizeFk(f, t.name, lookupTables);
      if (fk) sections.tableCreates.push(renderAddForeignKey(t.schema, t.name, fk));
    }
  }

  // --- 修改：ALTER 语句 ---
  for (const m of diff.tables.modified) {
    const qname = qualified(m.schema, m.name);

    // 1) drop FK 先于 drop column；IF EXISTS 兜底 tableDrops CASCADE 已捎带清除的情况
    for (const fk of m.fksDropped) {
      sections.alters.push(`ALTER TABLE ${qname} DROP CONSTRAINT IF EXISTS ${quoteIdent(fk.constraintName)};`);
    }
    // 1b) drop 表级约束（UNIQUE / CHECK）— 同样用 IF EXISTS 兜底
    for (const tc of m.tableConstraintsDropped) {
      sections.alters.push(`ALTER TABLE ${qname} DROP CONSTRAINT IF EXISTS ${quoteIdent(tc.name)};`);
    }
    // 2) drop index
    for (const idx of m.indexesDropped) {
      sections.alters.push(`DROP INDEX IF EXISTS ${qualified(m.schema, idx.name)};`);
    }
    // 3) drop column
    for (const col of m.columnsDropped) {
      sections.alters.push(`ALTER TABLE ${qname} DROP COLUMN ${quoteIdent(col)};`);
    }
    // 4) add column
    for (const col of m.columnsAdded) {
      sections.alters.push(
        `ALTER TABLE ${qname} ADD COLUMN ${renderColumnInline(col, targetEnums)};`
      );
    }
    // 5) modify column
    for (const cm of m.columnsModified) {
      sections.alters.push(...renderColumnModification(qname, cm));
    }
    // 6) PK 变更
    if (m.pkChanged) {
      if (m.pkChanged.from.length > 0) {
        // 占位约束名（PG 默认 <table>_pkey）
        sections.alters.push(
          `ALTER TABLE ${qname} DROP CONSTRAINT IF EXISTS ${quoteIdent(`${m.name}_pkey`)};`
        );
      }
      if (m.pkChanged.to.length > 0) {
        const cols = m.pkChanged.to.map(quoteIdent).join(', ');
        sections.alters.push(`ALTER TABLE ${qname} ADD PRIMARY KEY (${cols});`);
      }
    }
    // 7) add FK
    for (const fk of m.fksAdded) {
      sections.alters.push(renderAddForeignKey(m.schema, m.name, fk));
    }
    // 7b) add 表级约束
    for (const tc of m.tableConstraintsAdded) {
      const line = renderTableConstraintInline({ ...tc.constraint, name: tc.resolvedName }, tc.table);
      if (line) sections.alters.push(`ALTER TABLE ${qname} ADD ${line};`);
    }
    // 8) add index
    for (const idx of m.indexesAdded) {
      sections.alters.push(renderCreateIndex(m.schema, m.name, idx));
    }
    // 9) 表注释
    if (m.commentChanged) {
      sections.comments.push(
        `COMMENT ON TABLE ${qname} IS ${m.commentChanged.to == null ? 'NULL' : quoteLiteral(m.commentChanged.to)};`
      );
    }
    // 10) 列注释（在 columnsModified 里独立产出，下面分组）
    for (const cm of m.columnsModified) {
      if (cm.changes.comment) {
        const newC = cm.changes.comment.to;
        sections.comments.push(
          `COMMENT ON COLUMN ${qname}.${quoteIdent(cm.field)} IS ${newC == null ? 'NULL' : quoteLiteral(newC)};`
        );
      }
    }
    // 新增列若带 comment，也产出 COMMENT 语句
    for (const col of m.columnsAdded) {
      if (col.comment?.trim()) {
        sections.comments.push(
          `COMMENT ON COLUMN ${qname}.${quoteIdent(col.name)} IS ${quoteLiteral(col.comment.trim())};`
        );
      }
    }
  }

  return sections;
}

function renderColumnInline(field: FieldDefinition, enums: EnumType[]): string {
  const parts: string[] = [quoteIdent(field.name), renderFieldType(field, enums)];
  if (!field.nullable && !field.isPrimaryKey) parts.push('NOT NULL');
  if (field.identity) {
    parts.push(`GENERATED ${field.identity} AS IDENTITY`);
  } else if (field.defaultValue && field.defaultValue.trim()) {
    parts.push(`DEFAULT ${field.defaultValue.trim()}`);
  }
  if (field.isUnique && !field.isPrimaryKey) parts.push('UNIQUE');
  if (field.checkConstraint?.trim()) parts.push(`CHECK (${field.checkConstraint.trim()})`);
  return parts.join(' ');
}

function renderColumnModification(qname: string, cm: FieldChange): string[] {
  const out: string[] = [];
  const col = quoteIdent(cm.field);
  if (cm.changes.type) {
    out.push(
      `ALTER TABLE ${qname} ALTER COLUMN ${col} TYPE ${cm.changes.type.to} USING ${col}::${cm.changes.type.to};`
    );
  }
  if (cm.changes.nullable) {
    out.push(
      `ALTER TABLE ${qname} ALTER COLUMN ${col} ${cm.changes.nullable.to ? 'DROP' : 'SET'} NOT NULL;`
    );
  }
  if (cm.changes.default) {
    const to = cm.changes.default.to;
    out.push(
      to == null
        ? `ALTER TABLE ${qname} ALTER COLUMN ${col} DROP DEFAULT;`
        : `ALTER TABLE ${qname} ALTER COLUMN ${col} SET DEFAULT ${to};`
    );
  }
  if (cm.changes.unique) {
    if (cm.changes.unique.to) {
      out.push(
        `ALTER TABLE ${qname} ADD CONSTRAINT ${quoteIdent(`uq_${cm.field}`)} UNIQUE (${col});`
      );
    } else {
      out.push(
        `ALTER TABLE ${qname} DROP CONSTRAINT IF EXISTS ${quoteIdent(`uq_${cm.field}`)};`
      );
    }
  }
  return out;
}

function renderAddForeignKey(schema: string, table: string, fk: NormalizedFk): string {
  const onDelete = renderFkAction('ON DELETE', fk.onDelete);
  const onUpdate = renderFkAction('ON UPDATE', fk.onUpdate);
  return (
    `ALTER TABLE ${qualified(schema, table)} ` +
    `ADD CONSTRAINT ${quoteIdent(fk.constraintName)} ` +
    `FOREIGN KEY (${quoteIdent(fk.columnName)}) ` +
    `REFERENCES ${qualified(fk.refSchema, fk.refTable)} (${quoteIdent(fk.refColumn)})${onDelete}${onUpdate};`
  );
}

function renderCreateIndex(schema: string, table: string, idx: NormalizedIndex): string {
  const unique = idx.isUnique ? 'UNIQUE ' : '';
  const using = idx.indexType !== 'BTREE' ? ` USING ${idx.indexType}` : '';
  const cols = idx.columns
    .map(c => {
      // 简单标识符（无函数调用、无空格、无引号）视为列名加引号；否则按表达式原样输出
      const head = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c.text) ? quoteIdent(c.text) : c.text;
      const parts = [head];
      if (c.opclass) parts.push(c.opclass);
      const tail: string[] = [];
      if (c.direction === 'DESC') tail.push('DESC');
      if (c.nulls) tail.push(`NULLS ${c.nulls}`);
      return tail.length ? `${parts.join(' ')} ${tail.join(' ')}` : parts.join(' ');
    })
    .join(', ');
  const include = idx.include?.length
    ? ` INCLUDE (${idx.include.map(quoteIdent).join(', ')})`
    : '';
  const where = idx.predicate ? ` WHERE ${idx.predicate}` : '';
  return `CREATE ${unique}INDEX ${quoteIdent(idx.name)} ON ${qualified(schema, table)}${using} (${cols})${include}${where};`;
}

function renderCreateTableBlock(table: TableDefinition, enums: EnumType[]): string[] {
  const out: string[] = [];

  // CREATE TABLE
  const colLines = table.fields.map(f => `  ${renderColumnInline(f, enums)}`);
  const pkFields = table.fields.filter(f => f.isPrimaryKey);
  if (pkFields.length > 0) {
    colLines.push(`  PRIMARY KEY (${pkFields.map(f => quoteIdent(f.name)).join(', ')})`);
  }
  // 表级约束（UNIQUE / CHECK）内联在 CREATE TABLE 末尾
  for (const c of table.constraints ?? []) {
    const name = resolveConstraintName(c, table);
    const line = renderTableConstraintInline({ ...c, name }, table);
    if (line) colLines.push(`  ${line}`);
  }
  out.push(`CREATE TABLE ${qualified(table.schema, table.name)} (\n${colLines.join(',\n')}\n);`);

  // 注意：FK 不在此处生成。renderDiffSql 会在所有 CREATE TABLE 之后用完整 target.tables 统一追加，
  // 否则跨表 FK 在 normalizeFk(...[table]) 时被静默丢弃。

  // INDEX
  for (const i of table.indexes ?? []) {
    const ni = normalizeIndex(i, table);
    if (ni) out.push(renderCreateIndex(table.schema, table.name, ni));
  }

  // COMMENT
  if (table.comment?.trim()) {
    out.push(
      `COMMENT ON TABLE ${qualified(table.schema, table.name)} IS ${quoteLiteral(table.comment.trim())};`
    );
  }
  for (const f of table.fields) {
    if (f.comment?.trim()) {
      out.push(
        `COMMENT ON COLUMN ${qualified(table.schema, table.name)}.${quoteIdent(f.name)} IS ${quoteLiteral(f.comment.trim())};`
      );
    }
  }
  return out;
}

/**
 * 扁平化输出。顺序受依赖关系约束：
 *   1. enumCreates / enumAlters    新 ENUM 给后续 ALTER COLUMN TYPE → new_enum 与 CREATE TABLE 使用
 *   2. tableDrops                   CASCADE 顺带清理依赖（FK、列、索引）
 *   3. tableCreates                 让修改表的 ADD FK 能引用新表
 *   4. alters                       逐表内部已是 DROP→ADD 顺序：DROP FK/INDEX/COLUMN → ADD COLUMN → ALTER COLUMN TYPE → PK → ADD FK → ADD INDEX
 *   5. enumDrops                    等列改类型 / 表删除完毕后再 DROP TYPE，否则 PG 会因依赖拒绝
 *   6. comments
 */
export function flattenDiffSql(sections: DiffSqlSections): string[] {
  return [
    ...sections.enumCreates,
    ...sections.enumAlters,
    ...sections.tableDrops,
    ...sections.tableCreates,
    ...sections.alters,
    ...sections.enumDrops,
    ...sections.comments,
  ];
}

/** 是否无任何差异 */
export function isEmptyDiff(diff: SchemaDiff): boolean {
  return (
    diff.enums.added.length === 0 &&
    diff.enums.dropped.length === 0 &&
    diff.enums.valuesAdded.length === 0 &&
    diff.tables.added.length === 0 &&
    diff.tables.dropped.length === 0 &&
    diff.tables.modified.length === 0
  );
}

/** 统计变更条目数（用于概要） */
export function countDiffChanges(diff: SchemaDiff): {
  added: number;
  dropped: number;
  modified: number;
} {
  let added = diff.enums.added.length + diff.tables.added.length;
  let dropped = diff.enums.dropped.length + diff.tables.dropped.length;
  let modified = diff.enums.valuesAdded.length;
  for (const m of diff.tables.modified) {
    added += m.columnsAdded.length + m.fksAdded.length + m.indexesAdded.length + m.tableConstraintsAdded.length;
    dropped += m.columnsDropped.length + m.fksDropped.length + m.indexesDropped.length + m.tableConstraintsDropped.length;
    modified += m.columnsModified.length + (m.commentChanged ? 1 : 0) + (m.pkChanged ? 1 : 0);
  }
  return { added, dropped, modified };
}
