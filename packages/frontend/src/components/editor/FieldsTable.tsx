import React, { useState } from 'react';
import { Table, Button, Tooltip, Space, Empty } from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnsType } from 'antd/es/table';
import { useProjectStore } from '@/store/projectStore';
import type { FieldDefinition, TableDefinition } from '@/types/schema';
import FieldTypeSelect from './FieldTypeSelect';
import FieldNameCell from './FieldNameCell';
import ForeignKeyModal from './ForeignKeyModal';

interface DraggableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

const DraggableRow: React.FC<DraggableRowProps> = ({ children, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props['data-row-key'] });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 1, opacity: 0.75, background: '#f0f7ff' } : {}),
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children as React.ReactElement[], (child) => {
        if ((child as React.ReactElement).key === 'drag') {
          return React.cloneElement(child as React.ReactElement, {
            children: (
              <HolderOutlined
                ref={setActivatorNodeRef}
                style={{ touchAction: 'none', cursor: 'grab', color: '#bbb', fontSize: 14 }}
                {...listeners}
              />
            ),
          });
        }
        return child;
      })}
    </tr>
  );
};

interface Props {
  table: TableDefinition;
}

const FieldsTable: React.FC<Props> = ({ table }) => {
  const { project, updateField, deleteField, addField, reorderFields } = useProjectStore();
  const [fkField, setFkField] = useState<FieldDefinition | null>(null);

  const enums = project?.enums ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = table.fields.findIndex(f => f.id === active.id);
    const to = table.fields.findIndex(f => f.id === over.id);
    if (from !== -1 && to !== -1) reorderFields(table.id, from, to);
  };

  const columns: ColumnsType<FieldDefinition> = [
    {
      key: 'drag',
      width: 32,
      render: () => <HolderOutlined style={{ color: '#bbb' }} />,
    },
    {
      title: '',
      width: 32,
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
      width: 160,
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
      render: (_, record) => (
        <FieldTypeSelect
          field={record}
          enums={enums}
          onChange={changes => updateField(table.id, record.id, changes)}
        />
      ),
    },
    {
      title: '可空',
      dataIndex: 'nullable',
      key: 'nullable',
      width: 50,
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
      width: 44,
      align: 'center',
      render: (pk, record) => (
        <input
          type="checkbox"
          checked={pk}
          onChange={e =>
            updateField(table.id, record.id, {
              isPrimaryKey: e.target.checked,
              nullable: e.target.checked ? false : record.nullable,
            })
          }
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      title: '唯一',
      dataIndex: 'isUnique',
      key: 'isUnique',
      width: 44,
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
      width: 120,
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
      width: 68,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title={record.foreignKey ? '编辑外键' : '添加外键'}>
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined style={{ color: record.foreignKey ? '#1677ff' : '#bbb' }} />}
              onClick={() => setFkField(record)}
            />
          </Tooltip>
          <Tooltip title="删除字段">
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => deleteField(table.id, record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={table.fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <Table
            dataSource={table.fields}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={false}
            components={{ body: { row: DraggableRow } }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description='还没有字段，点击"添加字段"开始设计'
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
        </SortableContext>
      </DndContext>

      {fkField && (
        <ForeignKeyModal
          open
          tableId={table.id}
          field={fkField}
          onClose={() => setFkField(null)}
        />
      )}
    </>
  );
};

export default FieldsTable;
