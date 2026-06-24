import {useEffect, useState} from 'react'

import {Button, Form, Input, Modal, Select, Space} from 'antd'
import type React from 'react'

import {useProjectStore} from '@/store/projectStore'
import type {FieldDefinition, FkAction, ForeignKeyConfig} from '@/types/schema'

const FK_ACTIONS: {value: FkAction; label: string}[] = [
  {value: 'NO ACTION', label: 'NO ACTION'},
  {value: 'RESTRICT', label: 'RESTRICT'},
  {value: 'CASCADE', label: 'CASCADE'},
  {value: 'SET NULL', label: 'SET NULL'},
  {value: 'SET DEFAULT', label: 'SET DEFAULT'},
]

interface Props {
  open: boolean
  tableId: string
  field: FieldDefinition
  onClose: () => void
}

const ForeignKeyModal: React.FC<Props> = ({open, tableId, field, onClose}) => {
  const {project, updateField} = useProjectStore()
  const [form] = Form.useForm()
  const [refTableId, setRefTableId] = useState<string | undefined>()

  const tables = project?.tables.filter(t => t.id !== tableId) ?? []
  const refTable = tables.find(t => t.id === refTableId)

  useEffect(() => {
    if (open) {
      const fk = field.foreignKey
      setRefTableId(fk?.referenceTableId)
      form.setFieldsValue({
        referenceTableId: fk?.referenceTableId,
        referenceFieldId: fk?.referenceFieldId,
        onDelete: fk?.onDelete ?? 'NO ACTION',
        onUpdate: fk?.onUpdate ?? 'NO ACTION',
        constraintName: fk?.constraintName ?? '',
      })
    }
  }, [open, field.id, field.foreignKey, form])

  const handleSave = async () => {
    const values = await form.validateFields()
    updateField(tableId, field.id, {
      foreignKey: {
        referenceTableId: values.referenceTableId,
        referenceFieldId: values.referenceFieldId,
        onDelete: values.onDelete,
        onUpdate: values.onUpdate,
        constraintName: values.constraintName || undefined,
      } as ForeignKeyConfig,
    })
    onClose()
  }

  const handleClear = () => {
    updateField(tableId, field.id, {foreignKey: undefined})
    onClose()
  }

  return (
    <Modal
      footer={
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
          <Button danger disabled={!field.foreignKey} onClick={handleClear}>
            清除外键
          </Button>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave}>
              保存
            </Button>
          </Space>
        </div>
      }
      open={open}
      title={`配置外键 — ${field.name}`}
      width={480}
      onCancel={onClose}
    >
      <Form form={form} layout="vertical" style={{marginTop: 16}}>
        <Form.Item
          label="引用表"
          name="referenceTableId"
          rules={[{required: true, message: '请选择引用表'}]}
        >
          <Select
            showSearch
            dropdownStyle={{minWidth: 240}}
            optionFilterProp="label"
            options={tables.map(t => ({value: t.id, label: `${t.schema}.${t.name}`}))}
            placeholder="选择引用表"
            popupMatchSelectWidth={false}
            onChange={v => {
              setRefTableId(v)
              form.setFieldValue('referenceFieldId', undefined)
            }}
          />
        </Form.Item>
        <Form.Item
          label="引用字段"
          name="referenceFieldId"
          rules={[{required: true, message: '请选择引用字段'}]}
        >
          <Select
            showSearch
            disabled={!refTableId}
            dropdownStyle={{minWidth: 200}}
            optionFilterProp="label"
            options={(refTable?.fields ?? []).map(f => ({value: f.id, label: f.name}))}
            placeholder="选择引用字段"
            popupMatchSelectWidth={false}
          />
        </Form.Item>
        <Space size={16} style={{width: '100%'}}>
          <Form.Item label="ON DELETE" name="onDelete" style={{flex: 1, minWidth: 180}}>
            <Select
              dropdownStyle={{minWidth: 160}}
              options={FK_ACTIONS}
              popupMatchSelectWidth={false}
            />
          </Form.Item>
          <Form.Item label="ON UPDATE" name="onUpdate" style={{flex: 1, minWidth: 180}}>
            <Select
              dropdownStyle={{minWidth: 160}}
              options={FK_ACTIONS}
              popupMatchSelectWidth={false}
            />
          </Form.Item>
        </Space>
        <Form.Item label="约束名（可选）" name="constraintName">
          <Input placeholder="fk_orders_user_id" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ForeignKeyModal
