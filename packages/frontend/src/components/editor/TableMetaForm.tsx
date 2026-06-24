import {Form, Input} from 'antd'
import type React from 'react'

import {useProjectStore} from '@/store/projectStore'
import type {TableDefinition} from '@/types/schema'

interface Props {
  table: TableDefinition
}

const TableMetaForm: React.FC<Props> = ({table}) => {
  const {updateTable} = useProjectStore()

  return (
    <Form layout="vertical" style={{maxWidth: 480, paddingTop: 8}}>
      <Form.Item label="表名">
        <Input
          placeholder="table_name"
          value={table.name}
          onChange={e => updateTable(table.id, {name: e.target.value})}
        />
      </Form.Item>
      <Form.Item label="Schema">
        <Input
          placeholder="public"
          value={table.schema}
          onChange={e => updateTable(table.id, {schema: e.target.value})}
        />
      </Form.Item>
      <Form.Item label="注释">
        <Input.TextArea
          placeholder="表的用途描述..."
          rows={3}
          value={table.comment ?? ''}
          onChange={e => updateTable(table.id, {comment: e.target.value})}
        />
      </Form.Item>
    </Form>
  )
}

export default TableMetaForm
