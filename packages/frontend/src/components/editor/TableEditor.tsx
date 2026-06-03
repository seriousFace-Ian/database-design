import React from 'react';
import { Typography, Button, Empty, Tabs, Space } from 'antd';
import { PlusOutlined, TableOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import TableMetaForm from './TableMetaForm';
import FieldsTable from './FieldsTable';
import TableConstraintsPanel from './TableConstraintsPanel';

const { Title, Text } = Typography;

const TableEditor: React.FC = () => {
  const { project, addField } = useProjectStore();
  const { selectedTableId } = useUiStore();

  const table = project?.tables.find(t => t.id === selectedTableId);

  if (!project) {
    return (
      <Empty
        image={<TableOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
        description={
          <Space direction="vertical" size={4}>
            <Text>请新建或打开项目</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>支持 .dbdesign.json 文件</Text>
          </Space>
        }
        style={{ marginTop: 120 }}
      />
    );
  }

  if (!table) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="从左侧选择一张表，或新建表"
        style={{ marginTop: 120 }}
      />
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px 24px' }}>
      {/* 表头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TableOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          {table.schema}.{table.name}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => addField(table.id)}
        >
          添加字段
        </Button>
      </div>

      <Tabs
        defaultActiveKey="fields"
        style={{ flex: 1 }}
        items={[
          {
            key: 'fields',
            label: `字段 (${table.fields.length})`,
            children: <FieldsTable table={table} />,
          },
          {
            key: 'constraints',
            label: `约束 (${table.constraints?.length ?? 0})`,
            children: <TableConstraintsPanel table={table} />,
          },
          {
            key: 'meta',
            label: '表信息',
            children: <TableMetaForm table={table} />,
          },
        ]}
      />
    </div>
  );
};

export default TableEditor;
