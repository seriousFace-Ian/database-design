import type {ProjectFile} from './schema'

export interface DbConnectionConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: boolean
}

export interface SaveProjectConfigResponse {
  success: boolean
  updatedAt?: string
}

export interface LoadProjectConfigResponse {
  success: boolean
  found: boolean
  project?: ProjectFile // config 列内容，结构等同 ProjectFile
  updatedAt?: string
}

export interface ConnectionTestResponse {
  success: boolean
  version?: string
  error?: string
}

export interface ExecuteDdlRequest {
  connection: DbConnectionConfig
  statements: string[]
  transactional: boolean
}

export interface ExecuteDdlResponse {
  success: boolean
  executedCount: number
  errors?: Array<{statement: string; error: string}>
}

export interface InspectSchemaResponse {
  success: boolean
  data: {
    tables: ApiDbTable[]
    enums: ApiDbEnum[]
  }
}

export interface ApiDbTable {
  name: string
  schema: string
  comment: string | null
  columns: ApiDbColumn[]
  foreignKeys: ApiDbForeignKey[]
  indexes: ApiDbIndex[]
  constraints?: ApiDbTableConstraint[]
}

export interface ApiDbTableConstraint {
  name: string
  kind: 'UNIQUE' | 'CHECK' | 'EXCLUDE'
  columns?: string[] // UNIQUE：列序固定（按 conkey 顺序）
  expression?: string // CHECK：剥去外层 CHECK(...) 后的表达式

  // EXCLUDE（Phase 8）
  exclusionUsing?: string
  exclusionElements?: {column?: string; expression?: string; operator: string}[]
  exclusionWhere?: string
  exclusionDeferrable?: boolean
  exclusionInitiallyDeferred?: boolean
}

export interface ApiDbColumn {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  isIdentity?: boolean
  identityGeneration?: 'ALWAYS' | 'BY DEFAULT'
  isPrimaryKey: boolean
  isUnique: boolean
  comment: string | null
  ordinalPosition: number
}

export interface ApiDbForeignKey {
  constraintName: string
  columnName: string
  referenceTable: string
  referenceSchema: string
  referenceColumn: string
  onDelete: string
  onUpdate: string
}

export interface ApiDbIndexColumn {
  column: string | null
  expression?: string
  direction?: 'ASC' | 'DESC'
  opclass?: string
  nulls?: 'FIRST' | 'LAST'
}

export interface ApiDbIndex {
  name: string
  columns: string[]
  columnsDetail?: ApiDbIndexColumn[]
  isUnique: boolean
  indexType: string
  predicate?: string
  rawDefinition?: string
}

export interface ApiDbEnum {
  name: string
  schema: string
  values: string[]
}

export interface ApiError {
  code: string
  message: string
}
