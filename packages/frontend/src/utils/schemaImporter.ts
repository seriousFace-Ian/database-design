import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  IndexDefinition,
  IndexType,
  FkAction,
  PgFieldType,
  TableConstraint,
} from '@/types/schema';
import type { InspectSchemaResponse } from '@/types/api';

type InspectData = InspectSchemaResponse['data'];

// ==================== PG 类型字符串 → PgFieldType 反解析 ====================

// information_schema.data_type 用的是 SQL 标准名，需要映射回工具内部类型枚举
const DATA_TYPE_MAP: Record<string, PgFieldType> = {
  smallint: 'SMALLINT',
  integer: 'INTEGER',
  bigint: 'BIGINT',
  'character varying': 'VARCHAR',
  varchar: 'VARCHAR',
  character: 'CHAR',
  char: 'CHAR',
  text: 'TEXT',
  numeric: 'NUMERIC',
  decimal: 'NUMERIC',
  real: 'REAL',
  'double precision': 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  date: 'DATE',
  'time without time zone': 'TIME',
  time: 'TIME',
  'timestamp without time zone': 'TIMESTAMP',
  timestamp: 'TIMESTAMP',
  'timestamp with time zone': 'TIMESTAMPTZ',
  timestamptz: 'TIMESTAMPTZ',
  uuid: 'UUID',
  json: 'JSON',
  jsonb: 'JSONB',
};

// 数组列经 udt_name 暴露为内部名（如 _int4），映射回元素类型
const ARRAY_UDT_MAP: Record<string, PgFieldType> = {
  _int2: 'SMALLINT',
  _int4: 'INTEGER',
  _int8: 'BIGINT',
  _varchar: 'VARCHAR',
  _bpchar: 'CHAR',
  _text: 'TEXT',
  _numeric: 'NUMERIC',
  _float4: 'REAL',
  _float8: 'DOUBLE PRECISION',
  _bool: 'BOOLEAN',
  _date: 'DATE',
  _timestamp: 'TIMESTAMP',
  _timestamptz: 'TIMESTAMPTZ',
  _uuid: 'UUID',
  _json: 'JSON',
  _jsonb: 'JSONB',
};

interface ParsedType {
  type: PgFieldType;
  enumName?: string; // 未识别为内建类型时，候选 ENUM 名（udt_name）
  length?: number;
  precision?: number;
  scale?: number;
  isArray?: boolean;
}

/** 解析 inspector 返回的类型字符串，如 `character varying(200)`、`numeric(10,2)`、`_int4[]` */
function parseType(raw: string): ParsedType {
  let work = raw.trim();
  const isArray = work.endsWith('[]');
  if (isArray) work = work.slice(0, -2).trim();

  // 拆出括号内的参数
  let args: number[] = [];
  const paren = work.match(/^(.*?)\(([^)]*)\)$/);
  let base = work;
  if (paren) {
    base = paren[1].trim();
    args = paren[2].split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
  }
  const lower = base.toLowerCase();

  if (isArray) {
    // 数组：base 是内部 udt 名（如 _int4）
    return { type: ARRAY_UDT_MAP[lower] ?? 'TEXT', isArray: true };
  }

  const mapped = DATA_TYPE_MAP[lower];
  if (!mapped) {
    // 未知 → 视作自定义 ENUM 引用，原名留给调用方按名匹配
    return { type: 'USER-DEFINED', enumName: base };
  }

  const result: ParsedType = { type: mapped };
  if ((mapped === 'VARCHAR' || mapped === 'CHAR') && args[0]) {
    result.length = args[0];
  } else if (mapped === 'NUMERIC' && args.length > 0) {
    result.precision = args[0];
    if (args[1] != null) result.scale = args[1];
  }
  return result;
}

/** 自增列识别：integer/bigint + nextval 默认值 → SERIAL/BIGSERIAL，并清除默认值 */
function detectSerial(type: PgFieldType, defaultValue: string | null): {
  type: PgFieldType;
  defaultValue: string | null;
} {
  if (defaultValue && /nextval\(/i.test(defaultValue)) {
    if (type === 'INTEGER') return { type: 'SERIAL', defaultValue: null };
    if (type === 'BIGINT') return { type: 'BIGSERIAL', defaultValue: null };
  }
  return { type, defaultValue };
}

const VALID_INDEX_TYPES: IndexType[] = ['BTREE', 'HASH', 'GIN', 'GIST'];
function normalizeIndexType(raw: string): IndexType | undefined {
  const up = raw.toUpperCase();
  return VALID_INDEX_TYPES.includes(up as IndexType) ? (up as IndexType) : undefined;
}

const VALID_FK_ACTIONS: FkAction[] = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'];
function normalizeFkAction(raw: string): FkAction {
  const up = raw.toUpperCase();
  return VALID_FK_ACTIONS.includes(up as FkAction) ? (up as FkAction) : 'NO ACTION';
}

// ==================== 主转换 ====================

/** 将逆向读取的数据库结构转换为可编辑的 ProjectFile */
export function inspectionToProject(data: InspectData, projectName: string): ProjectFile {
  const ts = new Date().toISOString();

  // 1) ENUM：建 id，并按 name / schema.name 双键索引（udt_name 不带 schema）
  const enums: EnumType[] = data.enums.map(e => ({
    id: uuidv4(),
    name: e.name,
    schema: e.schema,
    values: [...e.values],
  }));
  const enumByName = new Map<string, string>();
  for (const e of enums) {
    enumByName.set(e.name, e.id);
    enumByName.set(`${e.schema}.${e.name}`, e.id);
  }

  // 2) 表与字段：先建好 id 与名称→id 的查找表，FK 留到第二趟解析
  const tableIdByName = new Map<string, string>(); // schema.table → id
  // tableId → (columnName → fieldId)，供 FK / 索引按列名解析
  const fieldIdByCol = new Map<string, Map<string, string>>();

  const tables: TableDefinition[] = data.tables.map(t => {
    const tableId = uuidv4();
    tableIdByName.set(`${t.schema}.${t.name}`, tableId);
    const colMap = new Map<string, string>();
    fieldIdByCol.set(tableId, colMap);

    const fields: FieldDefinition[] = t.columns.map((c, idx) => {
      const fieldId = uuidv4();
      colMap.set(c.name, fieldId);

      const parsed = parseType(c.type);
      const serial = detectSerial(parsed.type, c.defaultValue);

      const field: FieldDefinition = {
        id: fieldId,
        name: c.name,
        type: serial.type,
        nullable: c.nullable,
        isPrimaryKey: c.isPrimaryKey,
        isUnique: c.isUnique,
        order: c.ordinalPosition ?? idx,
      };
      if (parsed.length != null) field.length = parsed.length;
      if (parsed.precision != null) field.precision = parsed.precision;
      if (parsed.scale != null) field.scale = parsed.scale;
      if (parsed.isArray) field.isArray = true;
      if (serial.defaultValue) field.defaultValue = serial.defaultValue;
      if (c.comment) field.comment = c.comment;
      if (parsed.type === 'USER-DEFINED' && parsed.enumName) {
        const enumId = enumByName.get(parsed.enumName) ?? enumByName.get(`${t.schema}.${parsed.enumName}`);
        if (enumId) field.enumTypeId = enumId;
      }
      return field;
    });

    return {
      id: tableId,
      name: t.name,
      schema: t.schema,
      comment: t.comment ?? undefined,
      fields,
      indexes: [],
      createdAt: ts,
      updatedAt: ts,
    };
  });

  // 3) 第二趟：外键（按引用表名/列名解析回 id）
  data.tables.forEach((t, ti) => {
    const table = tables[ti];
    const colMap = fieldIdByCol.get(table.id)!;
    for (const fk of t.foreignKeys) {
      const fieldId = colMap.get(fk.columnName);
      if (!fieldId) continue;
      const refTableId = tableIdByName.get(`${fk.referenceSchema}.${fk.referenceTable}`);
      if (!refTableId) continue;
      const refFieldId = fieldIdByCol.get(refTableId)?.get(fk.referenceColumn);
      if (!refFieldId) continue;

      const field = table.fields.find(f => f.id === fieldId)!;
      field.foreignKey = {
        referenceTableId: refTableId,
        referenceFieldId: refFieldId,
        onDelete: normalizeFkAction(fk.onDelete),
        onUpdate: normalizeFkAction(fk.onUpdate),
        constraintName: fk.constraintName || undefined,
      };
    }
  });

  // 4) 索引：按列名解析为 fieldIds；跳过与单列 UNIQUE 约束重复的唯一索引
  data.tables.forEach((t, ti) => {
    const table = tables[ti];
    const colMap = fieldIdByCol.get(table.id)!;
    const indexes: IndexDefinition[] = [];
    for (const idx of t.indexes) {
      const fieldIds = idx.columns.map(c => colMap.get(c)).filter((id): id is string => !!id);
      if (fieldIds.length === 0) continue;

      // 单列唯一索引若对应字段已标记 UNIQUE，则由列级约束覆盖，避免重复
      if (idx.isUnique && fieldIds.length === 1) {
        const f = table.fields.find(ff => ff.id === fieldIds[0]);
        if (f?.isUnique) continue;
      }

      indexes.push({
        id: uuidv4(),
        name: idx.name,
        fieldIds,
        isUnique: idx.isUnique,
        indexType: normalizeIndexType(idx.indexType),
      });
    }
    table.indexes = indexes;
  });

  // 5) 表级约束（UNIQUE / CHECK）：按列名映射到 fieldIds；后端已过滤单列重复项
  data.tables.forEach((t, ti) => {
    const table = tables[ti];
    const colMap = fieldIdByCol.get(table.id)!;
    const constraints: TableConstraint[] = [];
    for (const tc of t.constraints ?? []) {
      if (tc.kind === 'UNIQUE') {
        const fieldIds = (tc.columns ?? [])
          .map(c => colMap.get(c))
          .filter((id): id is string => !!id);
        if (fieldIds.length === 0) continue;
        constraints.push({ id: uuidv4(), name: tc.name, kind: 'UNIQUE', fieldIds });
      } else {
        if (!tc.expression?.trim()) continue;
        constraints.push({ id: uuidv4(), name: tc.name, kind: 'CHECK', expression: tc.expression });
      }
    }
    if (constraints.length > 0) table.constraints = constraints;
  });

  return {
    $schema: 'https://dbdesign/schema/v1.json',
    version: '1.0',
    name: projectName,
    createdAt: ts,
    updatedAt: ts,
    enums,
    tables,
  };
}
