import { Pool } from 'pg';
import { createPool } from './pgClient';
import { DbConnectionConfig, DbTable, DbColumn, DbForeignKey, DbIndex, DbEnum, DbTableConstraint, InspectSchemaResponse } from '../types';

export async function inspectSchema(
  config: DbConnectionConfig,
  schemas: string[] = ['public']
): Promise<InspectSchemaResponse> {
  const pool = createPool(config);
  try {
    const [tables, enums] = await Promise.all([
      fetchTables(pool, schemas),
      fetchEnums(pool, schemas),
    ]);
    return { tables, enums };
  } finally {
    await pool.end();
  }
}

async function fetchTables(pool: Pool, schemas: string[]): Promise<DbTable[]> {
  const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ');

  // 获取表列表
  const tablesResult = await pool.query<{ table_name: string; table_schema: string; comment: string | null }>(
    `SELECT c.table_name, c.table_schema,
            obj_description(pgc.oid) as comment
     FROM information_schema.tables c
     JOIN pg_class pgc ON pgc.relname = c.table_name
     JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
     WHERE c.table_schema IN (${schemaPlaceholders})
       AND c.table_type = 'BASE TABLE'
       AND c.table_name <> '__dbdesign'
     ORDER BY c.table_schema, c.table_name`,
    schemas
  );

  const tables: DbTable[] = [];
  for (const row of tablesResult.rows) {
    const [columns, foreignKeys, indexes, constraints] = await Promise.all([
      fetchColumns(pool, row.table_schema, row.table_name),
      fetchForeignKeys(pool, row.table_schema, row.table_name),
      fetchIndexes(pool, row.table_schema, row.table_name),
      fetchTableConstraints(pool, row.table_schema, row.table_name),
    ]);

    tables.push({
      name: row.table_name,
      schema: row.table_schema,
      comment: row.comment,
      columns,
      foreignKeys,
      indexes,
      constraints,
    });
  }

  return tables;
}

/**
 * 抓取表级 UNIQUE / CHECK 约束。
 * 排除规则：
 *   - 单列 UNIQUE：已由列级 isUnique 表达，避免重复
 *   - 单列且表达式仅引用本列的 CHECK：已由列级 checkConstraint 表达
 *   - PG 自动产生的 `*_not_null` CHECK：忽略
 */
async function fetchTableConstraints(
  pool: Pool,
  schema: string,
  table: string
): Promise<DbTableConstraint[]> {
  const result = await pool.query<{
    name: string;
    kind: string;       // 'u' | 'c'
    def: string;        // pg_get_constraintdef 的全文，如 "UNIQUE (a, b)" 或 "CHECK ((col >= 0))"
    columns: (string | null)[] | null;
  }>(
    `SELECT
       con.conname AS name,
       con.contype::text AS kind,
       pg_get_constraintdef(con.oid) AS def,
       (
         SELECT array_agg(att.attname ORDER BY u.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
       ) AS columns
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     WHERE ns.nspname = $1 AND rel.relname = $2
       AND con.contype IN ('u', 'c')
     ORDER BY con.conname`,
    [schema, table]
  );

  const out: DbTableConstraint[] = [];
  for (const row of result.rows) {
    const cols = (row.columns ?? []).filter((c): c is string => !!c);
    if (row.kind === 'u') {
      // 单列 UNIQUE 走列级，跳过
      if (cols.length < 2) continue;
      out.push({ name: row.name, kind: 'UNIQUE', columns: cols });
      continue;
    }
    // CHECK：剥外层 "CHECK (...)"，保留内部表达式（可能含外层括号，由 PG 输出决定）
    const m = row.def.match(/^CHECK\s*\((.*)\)\s*$/i);
    const expr = (m ? m[1] : row.def).trim();
    // 排除 PG 自动给 NOT NULL 列生成的 *_not_null CHECK
    if (/^\w+ IS NOT NULL$/i.test(expr)) continue;
    // 单列且表达式只引用该列 → 已被列级 checkConstraint 表达
    if (cols.length === 1) {
      const col = cols[0];
      const onlyRefsCol = new RegExp(`^[^a-zA-Z_]*\\(*\\s*"?${escapeRegex(col)}"?\\b`).test(expr);
      if (onlyRefsCol && !mentionsOtherIdentifiers(expr, col)) continue;
    }
    out.push({ name: row.name, kind: 'CHECK', expression: expr });
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 粗略判断表达式中除了已知列之外是否还引用了其他标识符 */
function mentionsOtherIdentifiers(expr: string, knownCol: string): boolean {
  const KW = new Set([
    'AND', 'OR', 'NOT', 'IS', 'NULL', 'TRUE', 'FALSE',
    'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  ]);
  const idents = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  return idents.some(i => i !== knownCol && !KW.has(i.toUpperCase()));
}

async function fetchColumns(pool: Pool, schema: string, table: string): Promise<DbColumn[]> {
  const result = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    is_primary_key: boolean;
    is_unique: boolean;
    comment: string | null;
    ordinal_position: number;
  }>(
    `SELECT
       c.column_name,
       CASE
         WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
         WHEN c.data_type = 'ARRAY' THEN c.udt_name || '[]'
         WHEN c.character_maximum_length IS NOT NULL THEN c.data_type || '(' || c.character_maximum_length || ')'
         WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
           AND c.data_type IN ('numeric', 'decimal')
           THEN c.data_type || '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
         ELSE c.data_type
       END as data_type,
       c.is_nullable,
       c.column_default,
       COALESCE(pk.is_pk, false) as is_primary_key,
       COALESCE(uq.is_unique, false) as is_unique,
       pg_catalog.col_description(pgc.oid, c.ordinal_position) as comment,
       c.ordinal_position
     FROM information_schema.columns c
     JOIN pg_class pgc ON pgc.relname = c.table_name
     JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
     LEFT JOIN (
       SELECT ku.column_name, true as is_pk
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage ku
         ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = $1 AND tc.table_name = $2
     ) pk ON pk.column_name = c.column_name
     LEFT JOIN (
       -- 仅标记“单列 UNIQUE 约束”的列：is_unique 表示列级唯一。
       -- 复合 UNIQUE (a, b) 不应让 a、b 各自变成单列唯一，
       -- 否则导入后 SQL 生成器会输出列级 UNIQUE，改变约束语义。
       -- 复合唯一保留在索引中（pg_index 的复合唯一索引），不进入此处。
       SELECT column_name, true as is_unique
       FROM (
         SELECT ku.column_name,
                count(*) OVER (PARTITION BY ku.constraint_name) AS col_count
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage ku
           ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
         WHERE tc.constraint_type = 'UNIQUE'
           AND tc.table_schema = $1 AND tc.table_name = $2
       ) c_uq
       WHERE col_count = 1
     ) uq ON uq.column_name = c.column_name
     WHERE c.table_schema = $1 AND c.table_name = $2
     ORDER BY c.ordinal_position`,
    [schema, table]
  );

  return result.rows.map(row => ({
    name: row.column_name,
    type: row.data_type,
    nullable: row.is_nullable === 'YES',
    defaultValue: row.column_default,
    isPrimaryKey: row.is_primary_key,
    isUnique: row.is_unique,
    comment: row.comment,
    ordinalPosition: row.ordinal_position,
  }));
}

async function fetchForeignKeys(pool: Pool, schema: string, table: string): Promise<DbForeignKey[]> {
  const result = await pool.query<{
    constraint_name: string;
    column_name: string;
    ref_table: string;
    ref_schema: string;
    ref_column: string;
    on_delete: string;
    on_update: string;
  }>(
    `SELECT
       tc.constraint_name,
       kcu.column_name,
       ccu.table_name as ref_table,
       ccu.table_schema as ref_schema,
       ccu.column_name as ref_column,
       rc.delete_rule as on_delete,
       rc.update_rule as on_update
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.referential_constraints rc
       ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
     JOIN information_schema.constraint_column_usage ccu
       ON rc.unique_constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1 AND tc.table_name = $2`,
    [schema, table]
  );

  return result.rows.map(row => ({
    constraintName: row.constraint_name,
    columnName: row.column_name,
    referenceTable: row.ref_table,
    referenceSchema: row.ref_schema,
    referenceColumn: row.ref_column,
    onDelete: row.on_delete,
    onUpdate: row.on_update,
  }));
}

async function fetchIndexes(pool: Pool, schema: string, table: string): Promise<DbIndex[]> {
  const result = await pool.query<{
    index_name: string;
    column_names: string[];
    is_unique: boolean;
    index_type: string;
  }>(
    `SELECT
       i.relname as index_name,
       array_agg(a.attname ORDER BY ix.indkey) as column_names,
       ix.indisunique as is_unique,
       am.amname as index_type
     FROM pg_index ix
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
     JOIN pg_am am ON am.oid = i.relam
     WHERE n.nspname = $1 AND t.relname = $2
       AND NOT ix.indisprimary
     GROUP BY i.relname, ix.indisunique, am.amname`,
    [schema, table]
  );

  return result.rows.map(row => ({
    name: row.index_name,
    columns: row.column_names,
    isUnique: row.is_unique,
    indexType: row.index_type.toUpperCase(),
  }));
}

async function fetchEnums(pool: Pool, schemas: string[]): Promise<DbEnum[]> {
  const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query<{ name: string; schema: string; values: string[] }>(
    `SELECT
       t.typname as name,
       n.nspname as schema,
       array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typtype = 'e' AND n.nspname IN (${schemaPlaceholders})
     GROUP BY t.typname, n.nspname
     ORDER BY n.nspname, t.typname`,
    schemas
  );

  return result.rows.map(row => ({
    name: row.name,
    schema: row.schema,
    values: row.values,
  }));
}
