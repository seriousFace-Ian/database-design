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
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
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

export interface DbIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  indexType: string;
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
