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
  success: boolean;
  data: {
    tables: ApiDbTable[];
    enums: ApiDbEnum[];
  };
}

export interface ApiDbTable {
  name: string;
  schema: string;
  comment: string | null;
  columns: ApiDbColumn[];
  foreignKeys: ApiDbForeignKey[];
  indexes: ApiDbIndex[];
}

export interface ApiDbColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  comment: string | null;
  ordinalPosition: number;
}

export interface ApiDbForeignKey {
  constraintName: string;
  columnName: string;
  referenceTable: string;
  referenceSchema: string;
  referenceColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface ApiDbIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
  indexType: string;
}

export interface ApiDbEnum {
  name: string;
  schema: string;
  values: string[];
}

export interface ApiError {
  code: string;
  message: string;
}
