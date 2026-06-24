import {useEffect, useMemo, useState} from 'react'

import {App, Checkbox, Divider, Modal, Select, Space, Tag, Typography} from 'antd'
import type React from 'react'

import {useProjectStore} from '@/store/projectStore'
import type {TableDefinition} from '@/types/schema'
import {
  AUDIT_FIELD_CATALOG,
  AUDIT_GROUP_LABELS,
  AUDIT_OWNER_TYPES,
  type AuditFieldGroup,
  type AuditFieldKey,
  auditFieldPreview,
  type AuditOwnerType,
} from '@/utils/auditFields'

const {Text} = Typography

interface Props {
  open: boolean
  table: TableDefinition
  onClose: () => void
}

const GROUP_ORDER: AuditFieldGroup[] = ['timestamp', 'actor', 'extra']

/** 一键审计字段弹窗：勾选要补齐的字段 + 选择操作者字段类型 */
const AuditFieldsModal: React.FC<Props> = ({open, table, onClose}) => {
  const {message} = App.useApp()
  const {addAuditFields} = useProjectStore()

  const existingNames = useMemo(() => new Set(table.fields.map(f => f.name)), [table.fields])

  const [ownerType, setOwnerType] = useState<AuditOwnerType>('BIGINT')
  const [checked, setChecked] = useState<Set<AuditFieldKey>>(new Set())

  // 每次打开：核心字段默认勾选，但已存在的不勾（会被跳过）；ownerType 保留上次选择
  useEffect(() => {
    if (!open) return
    const init = new Set<AuditFieldKey>()
    for (const spec of AUDIT_FIELD_CATALOG) {
      if (spec.defaultChecked && !existingNames.has(spec.build(ownerType).name)) {
        init.add(spec.key)
      }
    }
    setChecked(init)
  }, [existingNames, open, ownerType])

  const toggle = (key: AuditFieldKey, on: boolean) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleOk = () => {
    const keys = [...checked]
    if (keys.length === 0) {
      message.info('未选择任何字段')
      onClose()
      return
    }
    const {added, skipped} = addAuditFields(table.id, {keys, ownerType})
    if (added.length > 0 && skipped.length > 0) {
      message.success(`已添加 ${added.join('、')}；已存在跳过 ${skipped.join('、')}`)
    } else if (added.length > 0) {
      message.success(`已添加 ${added.length} 个审计字段：${added.join('、')}`)
    } else {
      message.info(`所选字段均已存在：${skipped.join('、')}`)
    }
    onClose()
  }

  return (
    <Modal
      okText="添加所选"
      open={open}
      title="补齐审计字段"
      width={580}
      onCancel={onClose}
      onOk={handleOk}
    >
      <div
        style={{
          margin: '4px 0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Text style={{fontSize: 12}} type="secondary">
          操作者字段类型
        </Text>
        <Select
          options={AUDIT_OWNER_TYPES.map(t => ({value: t, label: t}))}
          size="small"
          style={{width: 110}}
          value={ownerType}
          onChange={setOwnerType}
        />
        <Text style={{fontSize: 12}} type="secondary">
          应用于 *_by 字段，请与 users 表主键类型一致
        </Text>
      </div>

      {GROUP_ORDER.map(group => (
        <div key={group}>
          <Divider orientation="left" style={{margin: '12px 0 8px'}}>
            <Text strong style={{fontSize: 13}}>
              {AUDIT_GROUP_LABELS[group]}
            </Text>
          </Divider>
          <Space direction="vertical" size={8} style={{width: '100%'}}>
            {AUDIT_FIELD_CATALOG.filter(s => s.group === group).map(spec => {
              const proto = spec.build(ownerType)
              const exists = existingNames.has(proto.name)
              return (
                <div
                  key={spec.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Checkbox
                    checked={exists || checked.has(spec.key)}
                    disabled={exists}
                    onChange={e => toggle(spec.key, e.target.checked)}
                  >
                    <Text code>{proto.name}</Text>
                    {proto.comment && (
                      <Text style={{fontSize: 12, marginLeft: 6}} type="secondary">
                        {proto.comment}
                      </Text>
                    )}
                    {exists && <Tag style={{marginLeft: 6}}>已存在</Tag>}
                  </Checkbox>
                  <Text
                    style={{fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap'}}
                    type="secondary"
                  >
                    {auditFieldPreview(proto)}
                  </Text>
                </div>
              )
            })}
          </Space>
        </div>
      ))}
    </Modal>
  )
}

export default AuditFieldsModal
