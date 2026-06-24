import React, {useState} from 'react'

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd'

import {useProjectStore} from '@/store/projectStore'
import type {IndexColumn, IndexDefinition, IndexType, TableDefinition} from '@/types/schema'

const {Text} = Typography

const INDEX_TYPE_OPTIONS: {value: IndexType; label: string}[] = [
  {value: 'BTREE', label: 'BTREE（默认）'},
  {value: 'HASH', label: 'HASH'},
  {value: 'GIN', label: 'GIN'},
  {value: 'GIST', label: 'GIST'},
  {value: 'BRIN', label: 'BRIN'},
  {value: 'SPGIST', label: 'SPGIST'},
]

interface Props {
  table: TableDefinition
}

const TableIndexesPanel: React.FC<Props> = ({table}) => {
  const {addIndex, updateIndex, deleteIndex} = useProjectStore()
  const {modal} = App.useApp()
  const {token} = theme.useToken()
  const [editing, setEditing] = useState<{existing?: IndexDefinition} | null>(null)

  const indexes = table.indexes ?? []
  const fieldName = (id?: string) => (id ? (table.fields.find(f => f.id === id)?.name ?? '?') : '?')

  const previewColumns = (idx: IndexDefinition): string => {
    return idx.columns
      .map(c => {
        const head = c.fieldId ? fieldName(c.fieldId) : (c.expression ?? '')
        const dir = c.direction === 'DESC' ? ' DESC' : ''
        const op = c.opclass ? ` ${c.opclass}` : ''
        return `${head}${op}${dir}`
      })
      .join(', ')
  }

  const handleDelete = (idx: IndexDefinition) => {
    modal.confirm({
      title: `删除索引 ${idx.name || '(自动命名)'}？`,
      content: previewColumns(idx),
      okText: '删除',
      okButtonProps: {danger: true},
      cancelText: '取消',
      onOk: () => deleteIndex(table.id, idx.id),
    })
  }

  return (
    <div>
      <Space style={{marginBottom: 12}}>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({})}>
          添加索引
        </Button>
      </Space>

      {indexes.length === 0 ? (
        <Empty
          description="还没有索引。多列 / 部分 / 表达式 / GIN 索引都在这里添加。"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Space direction="vertical" size={8} style={{width: '100%'}}>
          {indexes.map(idx => (
            <div
              key={idx.id}
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 6,
                padding: '8px 12px',
                background: token.colorFillQuaternary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Space size={8} style={{flex: 1, minWidth: 0}}>
                {idx.isUnique && <Tag color="blue">UNIQUE</Tag>}
                <Tag>{idx.indexType ?? 'BTREE'}</Tag>
                <Text strong style={{minWidth: 0}}>
                  {idx.name?.trim() || <Text type="secondary">(自动命名)</Text>}
                </Text>
                <Text
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 380,
                  }}
                  type="secondary"
                >
                  ({previewColumns(idx)})
                  {idx.predicate?.trim() ? ` WHERE ${idx.predicate.trim()}` : ''}
                </Text>
              </Space>
              <Space size={2}>
                <Tooltip title="编辑">
                  <Button
                    icon={<EditOutlined />}
                    size="small"
                    type="text"
                    onClick={() => setEditing({existing: idx})}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    onClick={() => handleDelete(idx)}
                  />
                </Tooltip>
              </Space>
            </div>
          ))}
        </Space>
      )}

      {editing && (
        <IndexEditModal
          existing={editing.existing}
          table={table}
          onClose={() => setEditing(null)}
          onSave={values => {
            if (editing.existing) {
              updateIndex(table.id, editing.existing.id, values)
            } else {
              addIndex(table.id, values)
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

// ==================== 编辑 / 添加 Modal ====================

interface ModalProps {
  table: TableDefinition
  existing?: IndexDefinition
  onSave: (values: Omit<IndexDefinition, 'id'>) => void
  onClose: () => void
}

type ColumnMode = 'field' | 'expression'
interface EditableColumn extends IndexColumn {
  mode: ColumnMode
}

const IndexEditModal: React.FC<ModalProps> = ({table, existing, onSave, onClose}) => {
  const [form] = Form.useForm<{
    name: string
    indexType: IndexType
    isUnique: boolean
    predicate: string
  }>()
  const [columns, setColumns] = useState<EditableColumn[]>(() =>
    existing
      ? existing.columns.map(c => ({
          ...c,
          mode: c.fieldId ? 'field' : 'expression',
        }))
      : [{mode: 'field', direction: 'ASC'}]
  )
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    form.setFieldsValue({
      name: existing?.name ?? '',
      indexType: existing?.indexType ?? 'BTREE',
      isUnique: !!existing?.isUnique,
      predicate: existing?.predicate ?? '',
    })
  }, [existing, form])

  const validateColumns = (cols: EditableColumn[]): string | null => {
    if (cols.length === 0) return '至少需要 1 列'
    for (const c of cols) {
      if (c.mode === 'field' && !c.fieldId) return '所有"字段"模式的行必须选择字段'
      if (c.mode === 'expression' && !c.expression?.trim()) {
        return '所有"表达式"模式的行必须填写表达式'
      }
    }
    const fieldIds = cols.filter(c => c.mode === 'field' && c.fieldId).map(c => c.fieldId!)
    if (new Set(fieldIds).size !== fieldIds.length) {
      return '同一字段不能出现两次'
    }
    return null
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    const colErr = validateColumns(columns)
    if (colErr) {
      setError(colErr)
      return
    }
    setError(null)
    const cleanedColumns: IndexColumn[] = columns.map(c => {
      const out: IndexColumn = {}
      if (c.mode === 'field') {
        out.fieldId = c.fieldId
      } else {
        out.expression = c.expression?.trim()
      }
      if (c.direction === 'DESC') out.direction = 'DESC'
      if (c.opclass?.trim()) out.opclass = c.opclass.trim()
      if (c.nulls) out.nulls = c.nulls
      return out
    })

    onSave({
      name: values.name?.trim() ?? '',
      indexType: values.indexType,
      isUnique: !!values.isUnique,
      predicate: values.predicate?.trim() || undefined,
      columns: cleanedColumns,
    })
  }

  const moveCol = (from: number, to: number) => {
    if (to < 0 || to >= columns.length) return
    const next = [...columns]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    setColumns(next)
  }

  const updateCol = (idx: number, changes: Partial<EditableColumn>) => {
    setColumns(prev => prev.map((c, i) => (i === idx ? {...c, ...changes} : c)))
  }

  const addCol = () => {
    setColumns(prev => [...prev, {mode: 'field', direction: 'ASC'}])
  }

  const removeCol = (idx: number) => {
    setColumns(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <Modal
      open
      cancelText="取消"
      okText="保存"
      title={`${existing ? '编辑' : '添加'}索引`}
      width={680}
      onCancel={onClose}
      onOk={handleOk}
    >
      <Form form={form} layout="vertical" style={{marginTop: 16}}>
        <Form.Item
          extra={
            <Text style={{fontSize: 12}} type="secondary">
              省略时自动生成：{`${'isUnique'} ? uq_ : idx_`}
              <code>{`{table}_{col1}_{col2}...`}</code>
            </Text>
          }
          label="索引名（可选）"
          name="name"
        >
          <Input placeholder="idx_models_visible" />
        </Form.Item>

        <Space wrap size={24}>
          <Form.Item label="索引类型" name="indexType" style={{marginBottom: 0}}>
            <Select options={INDEX_TYPE_OPTIONS} style={{width: 180}} />
          </Form.Item>
          <Form.Item
            label="UNIQUE"
            name="isUnique"
            style={{marginBottom: 0}}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Space>

        <Form.Item label="索引列" style={{marginTop: 16}}>
          <Space direction="vertical" size={8} style={{width: '100%'}}>
            {columns.map((col, i) => (
              <div
                key={i}
                style={{
                  border: '1px dashed #d9d9d9',
                  borderRadius: 6,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <Space wrap size={6}>
                  <Radio.Group
                    buttonStyle="solid"
                    optionType="button"
                    options={[
                      {label: '字段', value: 'field'},
                      {label: '表达式', value: 'expression'},
                    ]}
                    size="small"
                    value={col.mode}
                    onChange={e =>
                      updateCol(i, {
                        mode: e.target.value,
                        fieldId: undefined,
                        expression: undefined,
                      })
                    }
                  />
                  {col.mode === 'field' ? (
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={table.fields.map(f => ({label: f.name, value: f.id}))}
                      placeholder="选择字段"
                      size="small"
                      style={{width: 200}}
                      value={col.fieldId}
                      onChange={v => updateCol(i, {fieldId: v})}
                    />
                  ) : (
                    <Input
                      placeholder="LOWER(name)"
                      size="small"
                      style={{width: 240, fontFamily: 'monospace'}}
                      value={col.expression}
                      onChange={e => updateCol(i, {expression: e.target.value})}
                    />
                  )}
                  <Select
                    options={[
                      {label: 'ASC', value: 'ASC'},
                      {label: 'DESC', value: 'DESC'},
                    ]}
                    size="small"
                    style={{width: 80}}
                    value={col.direction ?? 'ASC'}
                    onChange={v => updateCol(i, {direction: v})}
                  />
                  <Input
                    placeholder="opclass (如 jsonb_path_ops)"
                    size="small"
                    style={{width: 160, fontFamily: 'monospace'}}
                    value={col.opclass ?? ''}
                    onChange={e => updateCol(i, {opclass: e.target.value || undefined})}
                  />
                  <Space size={2}>
                    <Tooltip title="上移">
                      <Button
                        disabled={i === 0}
                        icon={<ArrowUpOutlined />}
                        size="small"
                        type="text"
                        onClick={() => moveCol(i, i - 1)}
                      />
                    </Tooltip>
                    <Tooltip title="下移">
                      <Button
                        disabled={i === columns.length - 1}
                        icon={<ArrowDownOutlined />}
                        size="small"
                        type="text"
                        onClick={() => moveCol(i, i + 1)}
                      />
                    </Tooltip>
                    <Tooltip title="删除该列">
                      <Button
                        danger
                        disabled={columns.length === 1}
                        icon={<DeleteOutlined />}
                        size="small"
                        type="text"
                        onClick={() => removeCol(i)}
                      />
                    </Tooltip>
                  </Space>
                </Space>
              </div>
            ))}
            <Button icon={<PlusOutlined />} size="small" type="dashed" onClick={addCol}>
              添加列
            </Button>
            {error && (
              <Text style={{fontSize: 12}} type="danger">
                {error}
              </Text>
            )}
          </Space>
        </Form.Item>

        <Form.Item
          extra={
            <Text style={{fontSize: 12}} type="secondary">
              只填表达式本身，无需写 WHERE 关键字。例如：<code>deleted_at IS NULL</code>
            </Text>
          }
          label="WHERE 谓词（部分索引，可选）"
          name="predicate"
        >
          <Input.TextArea
            placeholder="deleted_at IS NULL"
            rows={2}
            style={{fontFamily: 'monospace'}}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default TableIndexesPanel
