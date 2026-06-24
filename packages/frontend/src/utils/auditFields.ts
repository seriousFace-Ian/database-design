import type {FieldDefinition} from '@/types/schema'

// ==================== 审计字段目录 ====================
// 「一键审计字段」的可选清单。核心 6 项（时间戳 + 操作者）默认勾选，
// 其余（乐观锁 / IP / 租户）默认不勾。操作者字段（*_by）的类型随 ownerType 注入，
// 以便与目标库 users 表主键类型对齐。

export type AuditFieldKey =
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'created_by'
  | 'updated_by'
  | 'deleted_by'
  | 'version'
  | 'created_ip'
  | 'updated_ip'
  | 'tenant_id'

export type AuditOwnerType = 'BIGINT' | 'INTEGER' | 'UUID'
export const AUDIT_OWNER_TYPES: AuditOwnerType[] = ['BIGINT', 'INTEGER', 'UUID']

export type AuditFieldGroup = 'timestamp' | 'actor' | 'extra'

export const AUDIT_GROUP_LABELS: Record<AuditFieldGroup, string> = {
  timestamp: '时间戳',
  actor: '操作者',
  extra: '其他',
}

type FieldProto = Omit<FieldDefinition, 'id' | 'order'>

export interface AuditFieldSpec {
  key: AuditFieldKey
  group: AuditFieldGroup
  /** 操作者字段：类型随 ownerType 变化（created_by / updated_by / deleted_by） */
  isActor?: boolean
  /** 默认勾选（核心字段） */
  defaultChecked: boolean
  /** 生成字段原型；actor 字段的 type 注入 ownerType */
  build: (ownerType: AuditOwnerType) => FieldProto
}

const ts = (
  name: string,
  comment: string,
  opts: {nullable: boolean; withDefault?: boolean}
): FieldProto => ({
  name,
  type: 'TIMESTAMPTZ',
  nullable: opts.nullable,
  isPrimaryKey: false,
  isUnique: false,
  ...(opts.withDefault ? {defaultValue: 'now()'} : {}),
  comment,
})

const actor =
  (name: string, comment: string) =>
  (ownerType: AuditOwnerType): FieldProto => ({
    name,
    type: ownerType,
    nullable: true,
    isPrimaryKey: false,
    isUnique: false,
    comment,
  })

export const AUDIT_FIELD_CATALOG: AuditFieldSpec[] = [
  // 时间戳
  {
    key: 'created_at',
    group: 'timestamp',
    defaultChecked: true,
    build: () => ts('created_at', '创建时间', {nullable: false, withDefault: true}),
  },
  {
    key: 'updated_at',
    group: 'timestamp',
    defaultChecked: true,
    build: () => ts('updated_at', '更新时间', {nullable: false, withDefault: true}),
  },
  {
    key: 'deleted_at',
    group: 'timestamp',
    defaultChecked: true,
    build: () => ts('deleted_at', '软删除时间（NULL = 未删除）', {nullable: true}),
  },
  // 操作者（类型随 ownerType）
  {
    key: 'created_by',
    group: 'actor',
    isActor: true,
    defaultChecked: true,
    build: actor('created_by', '创建者用户 ID'),
  },
  {
    key: 'updated_by',
    group: 'actor',
    isActor: true,
    defaultChecked: true,
    build: actor('updated_by', '最后修改者用户 ID'),
  },
  {
    key: 'deleted_by',
    group: 'actor',
    isActor: true,
    defaultChecked: true,
    build: actor('deleted_by', '删除操作者用户 ID'),
  },
  // 其他（默认不勾）
  {
    key: 'version',
    group: 'extra',
    defaultChecked: false,
    build: () => ({
      name: 'version',
      type: 'INTEGER',
      nullable: false,
      isPrimaryKey: false,
      isUnique: false,
      defaultValue: '0',
      comment: '乐观锁版本号（每次更新 +1）',
    }),
  },
  {
    key: 'created_ip',
    group: 'extra',
    defaultChecked: false,
    build: () => ({
      name: 'created_ip',
      type: 'INET',
      nullable: true,
      isPrimaryKey: false,
      isUnique: false,
      comment: '创建来源 IP',
    }),
  },
  {
    key: 'updated_ip',
    group: 'extra',
    defaultChecked: false,
    build: () => ({
      name: 'updated_ip',
      type: 'INET',
      nullable: true,
      isPrimaryKey: false,
      isUnique: false,
      comment: '最后修改来源 IP',
    }),
  },
  {
    key: 'tenant_id',
    group: 'extra',
    defaultChecked: false,
    build: () => ({
      name: 'tenant_id',
      type: 'BIGINT',
      nullable: true,
      isPrimaryKey: false,
      isUnique: false,
      comment: '租户 ID（多租户隔离）',
    }),
  },
]

/** 预览串：TIMESTAMPTZ  NOT NULL  DEFAULT now() */
export function auditFieldPreview(proto: FieldProto): string {
  const parts = [proto.type, proto.nullable ? 'NULL' : 'NOT NULL']
  if (proto.defaultValue) parts.push(`DEFAULT ${proto.defaultValue}`)
  return parts.join('  ')
}
