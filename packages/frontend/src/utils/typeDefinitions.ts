import type { PgFieldType } from '@/types/schema';

export interface TypeGroup {
  label: string;
  types: { value: PgFieldType; label: string; hasLength?: boolean; hasPrecision?: boolean }[];
}

export const PG_TYPE_GROUPS: TypeGroup[] = [
  {
    label: '整数类型',
    types: [
      { value: 'SMALLINT', label: 'SMALLINT（-32768 ~ 32767）' },
      { value: 'INTEGER', label: 'INTEGER（-2^31 ~ 2^31）' },
      { value: 'BIGINT', label: 'BIGINT（-2^63 ~ 2^63）' },
      { value: 'SERIAL', label: 'SERIAL（自增整数）' },
      { value: 'BIGSERIAL', label: 'BIGSERIAL（自增大整数）' },
    ],
  },
  {
    label: '文本类型',
    types: [
      { value: 'VARCHAR', label: 'VARCHAR（可变长字符串）', hasLength: true },
      { value: 'TEXT', label: 'TEXT（无限长字符串）' },
      { value: 'CHAR', label: 'CHAR（定长字符串）', hasLength: true },
    ],
  },
  {
    label: '数值类型',
    types: [
      { value: 'NUMERIC', label: 'NUMERIC（精确小数）', hasPrecision: true },
      { value: 'REAL', label: 'REAL（单精度浮点）' },
      { value: 'DOUBLE PRECISION', label: 'DOUBLE PRECISION（双精度浮点）' },
    ],
  },
  {
    label: '日期时间',
    types: [
      { value: 'DATE', label: 'DATE（日期）' },
      { value: 'TIME', label: 'TIME（时间）' },
      { value: 'TIMESTAMP', label: 'TIMESTAMP（不含时区）' },
      { value: 'TIMESTAMPTZ', label: 'TIMESTAMPTZ（含时区）' },
    ],
  },
  {
    label: '其他类型',
    types: [
      { value: 'BOOLEAN', label: 'BOOLEAN（布尔）' },
      { value: 'UUID', label: 'UUID' },
      { value: 'JSON', label: 'JSON' },
      { value: 'JSONB', label: 'JSONB（二进制 JSON）' },
    ],
  },
  {
    label: '自定义枚举',
    types: [
      { value: 'USER-DEFINED', label: 'ENUM（自定义枚举类型）' },
    ],
  },
];

export const ALL_PG_TYPES = PG_TYPE_GROUPS.flatMap(g => g.types);

export function getTypeInfo(type: PgFieldType) {
  return ALL_PG_TYPES.find(t => t.value === type);
}

export function typeHasLength(type: PgFieldType): boolean {
  return getTypeInfo(type)?.hasLength ?? false;
}

export function typeHasPrecision(type: PgFieldType): boolean {
  return getTypeInfo(type)?.hasPrecision ?? false;
}
