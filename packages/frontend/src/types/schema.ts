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

export type IndexType = 'BTREE' | 'HASH' | 'GIN' | 'GIST';

export interface IndexDefinition {
  id: string;
  name: string;
  fieldIds: string[];
  isUnique: boolean;
  indexType?: IndexType;
}

// ==================== 表级约束 ====================

export type TableConstraintKind = 'UNIQUE' | 'CHECK';

export interface TableConstraint {
  id: string;
  name?: string;             // CONSTRAINT <name>，省略时由生成器构造 uq_/chk_ 前缀名
  kind: TableConstraintKind;
  fieldIds?: string[];       // UNIQUE 必填（至少 2 列）；CHECK 选填，仅作 UI 关联元信息
  expression?: string;       // CHECK 必填，不含 CHECK 关键字与外层括号
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
