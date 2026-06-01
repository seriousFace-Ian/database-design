import React from 'react';
import { Form, Input } from 'antd';
import { useProjectStore } from '@/store/projectStore';
import type { TableDefinition } from '@/types/schema';

interface Props {
  table: TableDefinition;
}

const TableMetaForm: React.FC<Props> = ({ table }) => {
  const { updateTable } = useProjectStore();

  return (
    <Form layout="vertical" style={{ maxWidth: 480, paddingTop: 8 }}>
      <Form.Item label="表名">
        <Input
          value={table.name}
          onChange={e => updateTable(table.id, { name: e.target.value })}
          placeholder="table_name"
        />
      </Form.Item>
      <Form.Item label="Schema">
        <Input
          value={table.schema}
          onChange={e => updateTable(table.id, { schema: e.target.value })}
          placeholder="public"
        />
      </Form.Item>
      <Form.Item label="注释">
        <Input.TextArea
          value={table.comment ?? ''}
          onChange={e => updateTable(table.id, { comment: e.target.value })}
          rows={3}
          placeholder="表的用途描述..."
        />
      </Form.Item>
    </Form>
  );
};

export default TableMetaForm;
