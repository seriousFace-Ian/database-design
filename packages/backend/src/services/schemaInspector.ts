import { Pool } from 'pg';
import { createPool } from './pgClient';
import {
  DbConnectionConfig,
  DbTable,
  DbColumn,
  DbForeignKey,
  DbIndex,
  DbIndexColumn,
  DbEnum,
  DbTableConstraint,
  InspectSchemaResponse,
} from '../types';

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
 * 抓取表级 UNIQUE / CHECK / EXCLUDE 约束。
 * 排除规则：
 *   - 单列 UNIQUE：已由列级 isUnique 表达，避免重复
 *   - 单列且表达式仅引用本列的 CHECK：已由列级 checkConstraint 表达
 *   - PG 自动产生的 `*_not_null` CHECK：忽略
 *   - EXCLUDE：保留，并解析 USING / elements / WHERE / DEFERRABLE
 */
async function fetchTableConstraints(
  pool: Pool,
  schema: string,
  table: string
): Promise<DbTableConstraint[]> {
  const result = await pool.query<{
    name: string;
    kind: string; // 'u' | 'c' | 'x'
    def: string;
    columns: (string | null)[] | null;
    deferrable: boolean;
    initially_deferred: boolean;
    index_method: string | null;
  }>(
    `SELECT
       con.conname AS name,
       con.contype::text AS kind,
       pg_get_constraintdef(con.oid) AS def,
       (
         -- attname 是 name 类型，array_agg 会产生 name[]（OID 1003），
         -- node-pg 不解析该数组 OID 而原样返回字符串；显式 ::text 转成 text[] 才能拿到 JS 数组
         SELECT array_agg(att.attname::text ORDER BY u.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
       ) AS columns,
       con.condeferrable AS deferrable,
       con.condeferred  AS initially_deferred,
       am.amname        AS index_method
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = rel.relnamespace
     LEFT JOIN pg_class idx ON idx.oid = con.conindid
     LEFT JOIN pg_am    am  ON am.oid  = idx.relam
     WHERE ns.nspname = $1 AND rel.relname = $2
       AND con.contype IN ('u', 'c', 'x')
     ORDER BY con.conname`,
    [schema, table]
  );

  const out: DbTableConstraint[] = [];
  for (const row of result.rows) {
    const cols = (row.columns ?? []).filter((c): c is string => !!c);
    if (row.kind === 'u') {
      if (cols.length < 2) continue; // 单列 UNIQUE 走列级
      out.push({ name: row.name, kind: 'UNIQUE', columns: cols });
      continue;
    }
    if (row.kind === 'c') {
      const m = row.def.match(/^CHECK\s*\((.*)\)\s*$/i);
      const expr = (m ? m[1] : row.def).trim();
      if (/^\w+ IS NOT NULL$/i.test(expr)) continue;
      if (cols.length === 1) {
        const col = cols[0];
        const onlyRefsCol = new RegExp(`^[^a-zA-Z_]*\\(*\\s*"?${escapeRegex(col)}"?\\b`).test(expr);
        if (onlyRefsCol && !mentionsOtherIdentifiers(expr, col)) continue;
      }
      out.push({ name: row.name, kind: 'CHECK', expression: expr });
      continue;
    }
    // kind === 'x' — EXCLUDE
    const parsed = parseExclusionDef(row.def);
    out.push({
      name: row.name,
      kind: 'EXCLUDE',
      exclusionUsing: (parsed.using ?? row.index_method ?? 'gist').toUpperCase(),
      exclusionElements: parsed.elements,
      exclusionWhere: parsed.where,
      exclusionDeferrable: row.deferrable,
      exclusionInitiallyDeferred: row.initially_deferred,
    });
  }
  return out;
}

interface ParsedExclusion {
  using?: string;
  elements: { column?: string; expression?: string; operator: string }[];
  where?: string;
}

/**
 * 解析 pg_get_constraintdef 返回的 EXCLUDE 定义字符串。形如：
 *   EXCLUDE USING gist (room_id WITH =, during WITH &&) WHERE (active)
 * 复杂情形（表达式元素）退化为单元素 expression。
 */
function parseExclusionDef(def: string): ParsedExclusion {
  const usingMatch = def.match(/EXCLUDE\s+USING\s+(\w+)\s*\(/i);
  const using = usingMatch?.[1];
  const headIdx = def.indexOf('(', usingMatch?.index ?? 0);
  if (headIdx < 0) {
    return { using, elements: [{ expression: def, operator: '=' }] };
  }
  const { body, end } = extractBalanced(def, headIdx);
  const tail = def.slice(end + 1);
  const whereMatch = tail.match(/WHERE\s*\((.*)\)/is);
  const where = whereMatch?.[1]?.trim();

  const elements = splitTopLevel(body, ',').map(part => parseExclusionElement(part.trim()));
  return { using, elements, where };
}

function parseExclusionElement(piece: string): { column?: string; expression?: string; operator: string } {
  // 从右往左匹配 ` WITH op`
  const m = piece.match(/^(.*)\sWITH\s+(\S+)\s*$/is);
  if (!m) return { expression: piece, operator: '=' };
  const head = m[1].trim();
  const operator = m[2].trim();
  // 简单字段名（可带引号）：identifier 或 "identifier"
  const ident = head.match(/^"([^"]+)"$|^([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (ident) {
    return { column: ident[1] ?? ident[2], operator };
  }
  return { expression: head, operator };
}

/** 从给定 `(` 位置开始匹配到对应的 `)`，返回内部子串和结束下标 */
function extractBalanced(s: string, openIdx: number): { body: string; end: number } {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { body: s.slice(openIdx + 1, i), end: i };
    }
  }
  return { body: s.slice(openIdx + 1), end: s.length - 1 };
}

/** 在顶层（不进入括号）上按 sep 切分 */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    is_identity: string;          // 'YES' / 'NO'
    identity_generation: string | null; // 'ALWAYS' / 'BY DEFAULT'
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
       c.is_identity,
       c.identity_generation,
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
    isIdentity: row.is_identity === 'YES',
    identityGeneration:
      row.identity_generation === 'ALWAYS'
        ? 'ALWAYS'
        : row.identity_generation === 'BY DEFAULT'
          ? 'BY DEFAULT'
          : undefined,
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

/**
 * 索引抓取（Phase 8）：使用 pg_get_indexdef 还原文本，简单列引用解析为 column+direction；
 * 表达式列/opclass 整体退化为 expression。被 EXCLUDE 约束 / PK / UNIQUE 约束实现的底层索引一律跳过。
 */
async function fetchIndexes(pool: Pool, schema: string, table: string): Promise<DbIndex[]> {
  const result = await pool.query<{
    name: string;
    is_unique: boolean;
    index_type: string;
    definition: string;
    predicate: string | null;
  }>(
    `SELECT
       c.relname                                AS name,
       ix.indisunique                           AS is_unique,
       am.amname                                AS index_type,
       pg_get_indexdef(ix.indexrelid, 0, true)  AS definition,
       pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
     FROM pg_index ix
     JOIN pg_class c    ON c.oid = ix.indexrelid
     JOIN pg_class t    ON t.oid = ix.indrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_am am      ON am.oid = c.relam
     WHERE n.nspname = $1 AND t.relname = $2
       AND NOT ix.indisprimary
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint con
         WHERE con.conindid = ix.indexrelid AND con.contype IN ('p', 'u', 'x')
       )
     ORDER BY c.relname`,
    [schema, table]
  );

  return result.rows.map(row => {
    const parsed = parseIndexDef(row.definition);
    return {
      name: row.name,
      isUnique: row.is_unique,
      indexType: row.index_type.toUpperCase(),
      predicate: row.predicate ?? undefined,
      columns: parsed.columns.map(c => c.column ?? '').filter(Boolean),
      columnsDetail: parsed.columns,
      rawDefinition: row.definition,
    };
  });
}

interface ParsedIndexDef {
  columns: DbIndexColumn[];
}

/**
 * 解析 pg_get_indexdef，例如：
 *   CREATE INDEX idx_x ON public.t USING btree (a, b DESC) WHERE (deleted_at IS NULL)
 *   CREATE INDEX idx_y ON public.t USING gin (content jsonb_path_ops)
 *   CREATE INDEX idx_z ON public.t USING btree (lower(name))
 * 简单列引用 → column+direction；其他 → expression。
 */
function parseIndexDef(def: string): ParsedIndexDef {
  const openIdx = def.indexOf('(', def.search(/USING\s+\w+/i));
  if (openIdx < 0) return { columns: [] };
  const { body } = extractBalanced(def, openIdx);
  const parts = splitTopLevel(body, ',').map(p => p.trim());
  const columns: DbIndexColumn[] = parts.map(parseIndexElement);
  return { columns };
}

function parseIndexElement(raw: string): DbIndexColumn {
  let work = raw.trim();
  // 提取 DESC/ASC 和 NULLS FIRST/LAST 后缀
  let direction: 'ASC' | 'DESC' | undefined;
  let nulls: 'FIRST' | 'LAST' | undefined;
  const nullsMatch = work.match(/\bNULLS\s+(FIRST|LAST)\s*$/i);
  if (nullsMatch) {
    nulls = nullsMatch[1].toUpperCase() as 'FIRST' | 'LAST';
    work = work.slice(0, nullsMatch.index).trim();
  }
  const dirMatch = work.match(/\b(ASC|DESC)\s*$/i);
  if (dirMatch) {
    direction = dirMatch[1].toUpperCase() as 'ASC' | 'DESC';
    work = work.slice(0, dirMatch.index).trim();
  }
  // 简单字段：identifier 或 "identifier"
  const simple = work.match(/^"([^"]+)"$|^([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (simple) {
    return { column: simple[1] ?? simple[2], direction, nulls };
  }
  // 简单字段 + opclass：identifier opclass
  const withOpclass = work.match(/^("([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (withOpclass) {
    return {
      column: withOpclass[2] ?? withOpclass[3],
      opclass: withOpclass[4],
      direction,
      nulls,
    };
  }
  // 其余整体作为表达式
  return { column: null, expression: work, direction, nulls };
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
