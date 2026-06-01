import React from 'react';
import { Table, Button, Tooltip, Space, Empty } from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useProjectStore } from '@/store/projectStore';
import type { FieldDefinition, TableDefinition } from '@/types/schema';
import FieldTypeSelect from './FieldTypeSelect';
import FieldNameCell from './FieldNameCell';

interface Props {
  table: TableDefinition;
}

const FieldsTable: React.FC<Props> = ({ table }) => {
  const { updateField, deleteField, addField } = useProjectStore();

  const columns: ColumnsType<FieldDefinition> = [
    {
      title: '',
      width: 36,
      key: 'icons',
      render: (_, record) => (
        <Space size={2}>
          {record.isPrimaryKey && (
            <Tooltip title="主键">
              <KeyOutlined style={{ color: '#faad14', fontSize: 12 }} />
            </Tooltip>
          )}
          {record.foreignKey && (
            <Tooltip title="外键">
              <LinkOutlined style={{ color: '#1677ff', fontSize: 12 }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (_, record) => (
        <FieldNameCell
          field={record}
          onChange={name => updateField(table.id, record.id, { name })}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 200,
      render: (_, record) => (
        <FieldTypeSelect
          field={record}
          enums={[]}
          onChange={changes => updateField(table.id, record.id, changes)}
        />
      ),
    },
    {
      title: '可空',
      dataIndex: 'nullable',
      key: 'nullable',
      width: 60,
      align: 'center',
      render: (nullable, record) => (
        <input
          type="checkbox"
          checked={nullable}
          onChange={e => updateField(table.id, record.id, { nullable: e.target.checked })}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      title: 'PK',
      dataIndex: 'isPrimaryKey',
      key: 'isPrimaryKey',
      width: 50,
      align: 'center',
      render: (pk, record) => (
        <input
          type="checkbox"
          checked={pk}
          onChange={e => updateField(table.id, record.id, {
            isPrimaryKey: e.target.checked,
            nullable: e.target.checked ? false : record.nullable,
          })}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      title: '唯一',
      dataIndex: 'isUnique',
      key: 'isUnique',
      width: 50,
      align: 'center',
      render: (unique, record) => (
        <input
          type="checkbox"
          checked={unique}
          onChange={e => updateField(table.id, record.id, { isUnique: e.target.checked })}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      title: '默认值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      render: (val, record) => (
        <input
          style={{
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            padding: '2px 8px',
            width: '100%',
            fontSize: 13,
            outline: 'none',
          }}
          value={val ?? ''}
          placeholder="NULL"
          onChange={e => updateField(table.id, record.id, { defaultValue: e.target.value || undefined })}
        />
      ),
    },
    {
      title: '注释',
      dataIndex: 'comment',
      key: 'comment',
      render: (val, record) => (
        <input
          style={{
            border: '1px solid #d9d9d9',
            borderRadius: 4,
            padding: '2px 8px',
            width: '100%',
            fontSize: 13,
            outline: 'none',
          }}
          value={val ?? ''}
          placeholder="字段描述"
          onChange={e => updateField(table.id, record.id, { comment: e.target.value || undefined })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_, record) => (
        <Tooltip title="删除字段">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => deleteField(table.id, record.id)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <Table
        dataSource={table.fields}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={'还没有字段，点击"添加字段"开始设计'}
            />
          ),
        }}
        footer={() => (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => addField(table.id)}
            style={{ width: '100%' }}
          >
            添加字段
          </Button>
        )}
      />
    </div>
  );
};

export default FieldsTable;
