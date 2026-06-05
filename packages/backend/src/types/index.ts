export interface DbConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface ConnectionTestResponse {
  success: boolean;
  version?: string;
  error?: string;
}

export interface ExecuteDdlRequest {
  connection: DbConnectionConfig;
  statements: string[];
  transactional: boolean;
}

export interface ExecuteDdlResponse {
  success: boolean;
  executedCount: number;
  errors?: Array<{ statement: string; error: string }>;
}

export interface InspectSchemaResponse {
  tables: DbTable[];
  enums: DbEnum[];
}

export interface DbTable {
  name: string;
  schema: string;
  comment: string | null;
  columns: DbColumn[];
  foreignKeys: DbForeignKey[];
  indexes: DbIndex[];
  constraints?: DbTableConstraint[];
}

export interface DbTableConstraint {
  name: string;
  kind: 'UNIQUE' | 'CHECK' | 'EXCLUDE';
  columns?: string[];      // UNIQUE
  expression?: string;     // CHECK，已剥外层 CHECK(...)

  // EXCLUDE 专用（Phase 8）
  exclusionUsing?: string;                          // 索引方法 (gist/spgist/btree/hash)
  exclusionElements?: { column?: string; expression?: string; operator: string }[];
  exclusionWhere?: string;
  exclusionDeferrable?: boolean;
  exclusionInitiallyDeferred?: boolean;
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  /** Phase 8：IDENTITY 列识别 */
  isIdentity?: boolean;
  identityGeneration?: 'ALWAYS' | 'BY DEFAULT';
  isPrimaryKey: boolean;
  isUnique: boolean;
  comment: string | null;
  ordinalPosition: number;
}

export interface DbForeignKey {
  constraintName: string;
  columnName: string;
  referenceTable: string;
  referenceSchema: string;
  referenceColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface DbIndexColumn {
  /** 字段名；表达式列时为 null */
  column: string | null;
  /** 字段为 null 时，原始表达式片段（如 LOWER(name)） */
  expression?: string;
  direction?: 'ASC' | 'DESC';
  opclass?: string;
  nulls?: 'FIRST' | 'LAST';
}

export interface DbIndex {
  name: string;
  /** 兼容旧用法：纯字段索引时与 columnsDetail 的 column 字段一致 */
  columns: string[];
  /** 结构化列定义（Phase 8）；表达式索引与 opclass 通过此处携带 */
  columnsDetail?: DbIndexColumn[];
  isUnique: boolean;
  indexType: string;
  /** 部分索引 WHERE 子句（不含 WHERE 关键字） */
  predicate?: string;
  /** 复杂索引退化时保留 pg_get_indexdef 完整原文，前端直接重放 */
  rawDefinition?: string;
}

export interface DbEnum {
  name: string;
  schema: string;
  values: string[];
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
