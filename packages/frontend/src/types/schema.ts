// ==================== PostgreSQL 字段类型 ====================

export type PgIntegerType = 'SMALLINT' | 'INTEGER' | 'BIGINT' | 'SERIAL' | 'BIGSERIAL';
export type PgTextType = 'VARCHAR' | 'TEXT' | 'CHAR';
export type PgNumericType = 'NUMERIC' | 'REAL' | 'DOUBLE PRECISION';
export type PgDateTimeType = 'DATE' | 'TIME' | 'TIMESTAMP' | 'TIMESTAMPTZ';
export type PgBoolType = 'BOOLEAN';
export type PgJsonType = 'JSON' | 'JSONB';
export type PgUuidType = 'UUID';
export type PgUserDefinedType = 'USER-DEFINED'; // ENUM 引用

export type PgFieldType =
  | PgIntegerType
  | PgTextType
  | PgNumericType
  | PgDateTimeType
  | PgBoolType
  | PgJsonType
  | PgUuidType
  | PgUserDefinedType
  | string;

// ==================== 外键配置 ====================

export type FkAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export interface ForeignKeyConfig {
  referenceTableId: string;
  referenceFieldId: string;
  onDelete: FkAction;
  onUpdate: FkAction;
  constraintName?: string;
}

// ==================== IDENTITY 列（Phase 8） ====================

/** PG10+ 标准 IDENTITY 列；仅 SMALLINT / INTEGER / BIGINT 有意义 */
export type IdentityKind = 'ALWAYS' | 'BY DEFAULT';

// ==================== 字段定义 ====================

export interface FieldDefinition {
  id: string;
  name: string;
  type: PgFieldType;
  enumTypeId?: string;       // type === 'USER-DEFINED' 时引用 EnumType.id
  length?: number;           // VARCHAR(n)
  precision?: number;        // NUMERIC(p,s)
  scale?: number;
  isArray?: boolean;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  defaultValue?: string;
  checkConstraint?: string;
  foreignKey?: ForeignKeyConfig;
  comment?: string;
  order: number;
  /** GENERATED ALWAYS / BY DEFAULT AS IDENTITY；与 defaultValue 互斥 */
  identity?: IdentityKind;
}

// ==================== ENUM 类型 ====================

export interface EnumType {
  id: string;
  name: string;
  schema: string;
  values: string[];
  comment?: string;
}

// ==================== 索引定义 ====================

export type IndexType = 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'BRIN' | 'SPGIST';
export type IndexDirection = 'ASC' | 'DESC';
export type IndexNullsOrder = 'FIRST' | 'LAST';

/** 索引列：字段引用或自由表达式，二选一 */
export interface IndexColumn {
  fieldId?: string;
  expression?: string;            // 如 "LOWER(name)"、"(payload->>'kind')"
  direction?: IndexDirection;     // 默认 ASC（默认值不输出）
  opclass?: string;               // 如 'jsonb_path_ops'、'gin_trgm_ops'
  nulls?: IndexNullsOrder;        // 显式输出时附加 NULLS FIRST/LAST
}

export interface IndexDefinition {
  id: string;
  name: string;                   // 空字符串则按 idx_<table>_<col1>_<col2>... 自动命名
  columns: IndexColumn[];         // 结构化列定义（Phase 8 升级）
  isUnique: boolean;
  indexType?: IndexType;          // 默认 BTREE
  predicate?: string;             // 部分索引 WHERE 子句（不含 WHERE 关键字）
  include?: string[];             // INCLUDE 覆盖列名
  comment?: string;
}

// ==================== 表级约束 ====================

export type TableConstraintKind = 'UNIQUE' | 'CHECK' | 'EXCLUDE';

/** EXCLUDE USING <method> 支持的索引方法 */
export type ExclusionIndexMethod = 'GIST' | 'SPGIST' | 'BTREE' | 'HASH';

/** EXCLUDE 子句中的一个元素：列/表达式 + 比较操作符 */
export interface ExclusionElement {
  fieldId?: string;
  expression?: string;
  /** WITH 后的操作符：'='、'<>'、'&&'、'@>'、'<@' 等；不带引号 */
  operator: string;
}

export interface TableConstraint {
  id: string;
  name?: string;             // CONSTRAINT <name>，省略时由生成器构造 uq_/chk_/ex_ 前缀名
  kind: TableConstraintKind;
  fieldIds?: string[];       // UNIQUE 必填（至少 2 列）；CHECK 选填，仅作 UI 关联元信息
  expression?: string;       // CHECK 必填，不含 CHECK 关键字与外层括号

  // EXCLUDE 专用字段（Phase 8）
  exclusionElements?: ExclusionElement[];
  exclusionUsing?: ExclusionIndexMethod;   // 默认 GIST
  exclusionWhere?: string;                 // 可选谓词，不含 WHERE 关键字与外层括号
  exclusionDeferrable?: boolean;
  exclusionInitiallyDeferred?: boolean;

  comment?: string;
}

// ==================== 表定义 ====================

export interface TableDefinition {
  id: string;
  name: string;
  schema: string;
  comment?: string;
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
  constraints?: TableConstraint[]; // 表级 UNIQUE / CHECK；旧 JSON 缺失时视作 []
  position?: { x: number; y: number };
  createdAt: string;
  updatedAt: string;
}

// ==================== 项目文件根结构 ====================

export interface DiagramLayout {
  zoom: number;
  position: { x: number; y: number };
}

export interface ProjectFile {
  $schema: string;
  version: '1.0';
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  enums: EnumType[];
  tables: TableDefinition[];
  diagramLayout?: DiagramLayout;
}
