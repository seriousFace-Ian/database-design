import React, { useMemo, useState } from 'react';
import { Table, Button, Tooltip, Space, Empty, Input, Checkbox, theme, Dropdown } from 'antd';
import {
  DeleteOutlined,
  KeyOutlined,
  LinkOutlined,
  PlusOutlined,
  HolderOutlined,
  CheckCircleOutlined,
  FieldTimeOutlined,
  DownOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
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
import ConstraintConfig from './ConstraintConfig';
import AuditFieldsModal from './AuditFieldsModal';

interface DraggableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

const DraggableRow: React.FC<DraggableRowProps> = ({ children, ...props }) => {
  const { token } = theme.useToken();
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
    ...(isDragging
      ? { position: 'relative', zIndex: 1, opacity: 0.75, background: token.controlItemBgActive }
      : {}),
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children as React.ReactElement[], (child) => {
        if ((child as React.ReactElement).key === 'drag') {
          return React.cloneElement(child as React.ReactElement, {
            children: (
              <HolderOutlined
                ref={setActivatorNodeRef}
                style={{ touchAction: 'none', cursor: 'grab', color: token.colorTextDisabled, fontSize: 14 }}
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

// ==================== 默认值预设 ====================

interface PresetGroup {
  key: string;
  label: string;
  items: { value: string; label?: string }[];
  /** 该字段类型属于本组时，组排在最前 */
  matchTypes?: string[];
}

const DEFAULT_PRESETS: PresetGroup[] = [
  {
    key: 'timestamp',
    label: '时间戳',
    items: [{ value: 'now()' }, { value: 'CURRENT_TIMESTAMP' }],
    matchTypes: ['TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'TIME'],
  },
  {
    key: 'uuid',
    label: 'UUID',
    items: [{ value: 'gen_random_uuid()' }, { value: 'uuid_generate_v4()' }],
    matchTypes: ['UUID'],
  },
  {
    key: 'boolean',
    label: '布尔',
    items: [{ value: 'true' }, { value: 'false' }],
    matchTypes: ['BOOLEAN'],
  },
  {
    key: 'numeric',
    label: '数值',
    items: [{ value: '0' }, { value: '1' }],
    matchTypes: ['SMALLINT', 'INTEGER', 'BIGINT', 'NUMERIC', 'REAL', 'DOUBLE PRECISION'],
  },
  {
    key: 'string',
    label: '字符串',
    items: [{ value: "''", label: "'' (空字符串)" }],
    matchTypes: ['VARCHAR', 'TEXT', 'CHAR'],
  },
  {
    key: 'json',
    label: 'JSON',
    items: [
      { value: "'{}'", label: "'{}' (空对象)" },
      { value: "'[]'", label: "'[]' (空数组)" },
    ],
    matchTypes: ['JSON', 'JSONB'],
  },
  {
    key: 'sequence',
    label: '序列',
    items: [{ value: "nextval('seq_name')", label: "nextval('seq_name') —— 改名后使用" }],
  },
];

function buildPresetMenu(
  fieldType: string,
  onPick: (val: string) => void
): MenuProps {
  const typeUpper = String(fieldType).toUpperCase();
  const matched: PresetGroup[] = [];
  const others: PresetGroup[] = [];
  for (const g of DEFAULT_PRESETS) {
    if (g.matchTypes?.some(t => t === typeUpper)) {
      matched.push(g);
    } else {
      others.push(g);
    }
  }
  const ordered = [...matched, ...others];
  return {
    items: ordered.map((g, gi) => ({
      key: `g-${g.key}`,
      type: 'group' as const,
      label: g.label + (matched.includes(g) && gi === 0 ? ' · 推荐' : ''),
      children: g.items.map(it => ({
        key: `${g.key}-${it.value}`,
        label: it.label ?? it.value,
        onClick: () => onPick(it.value),
      })),
    })),
  };
}

const DefaultValueInput: React.FC<{
  field: FieldDefinition;
  onChange: (next: string | undefined) => void;
}> = ({ field, onChange }) => {
  const menu = useMemo(
    () => buildPresetMenu(String(field.type), v => onChange(v)),
    [field.type, onChange]
  );
  const disabled = !!field.identity;
  return (
    <Input
      size="small"
      value={field.defaultValue ?? ''}
      placeholder={disabled ? 'IDENTITY 列' : 'NULL'}
      disabled={disabled}
      onChange={e => onChange(e.target.value || undefined)}
      addonAfter={
        <Dropdown menu={menu} trigger={['click']} disabled={disabled}>
          <Tooltip title="常用默认值预设">
            <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <ThunderboltOutlined />
              <DownOutlined style={{ fontSize: 9 }} />
            </span>
          </Tooltip>
        </Dropdown>
      }
    />
  );
};

interface Props {
  table: TableDefinition;
}

const FieldsTable: React.FC<Props> = ({ table }) => {
  const { token } = theme.useToken();
  const { project, updateField, deleteField, addField, reorderFields } = useProjectStore();
  const [fkField, setFkField] = useState<FieldDefinition | null>(null);
  const [checkField, setCheckField] = useState<FieldDefinition | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

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
      fixed: 'left',
      render: () => <HolderOutlined style={{ color: token.colorTextDisabled }} />,
    },
    {
      title: '',
      width: 32,
      fixed: 'left',
      key: 'icons',
      render: (_, record) => (
        <Space size={2}>
          {record.isPrimaryKey && (
            <Tooltip title="主键">
              <KeyOutlined style={{ color: token.colorWarning, fontSize: 12 }} />
            </Tooltip>
          )}
          {record.foreignKey && (
            <Tooltip title="外键">
              <LinkOutlined style={{ color: token.colorPrimary, fontSize: 12 }} />
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
      fixed: 'left',
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
      width: 340,
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
        <Checkbox
          checked={nullable}
          onChange={e => updateField(table.id, record.id, { nullable: e.target.checked })}
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
        <Checkbox
          checked={pk}
          onChange={e =>
            updateField(table.id, record.id, {
              isPrimaryKey: e.target.checked,
              nullable: e.target.checked ? false : record.nullable,
            })
          }
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
        <Checkbox
          checked={unique}
          onChange={e => updateField(table.id, record.id, { isUnique: e.target.checked })}
        />
      ),
    },
    {
      title: '默认值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      width: 160,
      render: (_, record) => (
        <DefaultValueInput
          field={record}
          onChange={next => updateField(table.id, record.id, { defaultValue: next })}
        />
      ),
    },
    {
      title: '注释',
      dataIndex: 'comment',
      key: 'comment',
      width: 240,
      render: (val, record) => (
        <Input
          size="small"
          value={val ?? ''}
          placeholder="字段描述"
          onChange={e => updateField(table.id, record.id, { comment: e.target.value || undefined })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2}>
          <Tooltip
            title={
              record.checkConstraint
                ? `CHECK (${record.checkConstraint})${record.identity ? ` · IDENTITY ${record.identity}` : ''}`
                : record.identity
                  ? `IDENTITY ${record.identity}`
                  : '列约束（CHECK / IDENTITY）'
            }
          >
            <Button
              type="text"
              size="small"
              icon={
                <CheckCircleOutlined
                  style={{
                    color:
                      record.checkConstraint || record.identity
                        ? token.colorSuccess
                        : token.colorTextDisabled,
                  }}
                />
              }
              onClick={() => setCheckField(record)}
            />
          </Tooltip>
          <Tooltip title={record.foreignKey ? '编辑外键' : '添加外键'}>
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined style={{ color: record.foreignKey ? token.colorPrimary : token.colorTextDisabled }} />}
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
            // 列宽合计约 32+32+180+340+50+44+44+140+240+110 ≈ 1212；窄屏内部横向滚动
            scroll={{ x: 1240 }}
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
              <Space.Compact style={{ width: '100%' }}>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => addField(table.id)}
                  style={{ flex: 1 }}
                >
                  添加字段
                </Button>
                <Tooltip title="选择要补齐的审计字段（创建/更新/删除的时间与操作者、乐观锁版本、来源 IP 等）">
                  <Button
                    type="dashed"
                    icon={<FieldTimeOutlined />}
                    onClick={() => setAuditOpen(true)}
                    style={{ flex: 1 }}
                  >
                    审计字段
                  </Button>
                </Tooltip>
              </Space.Compact>
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

      {checkField && (
        <ConstraintConfig
          open
          tableId={table.id}
          field={checkField}
          onClose={() => setCheckField(null)}
        />
      )}

      <AuditFieldsModal open={auditOpen} table={table} onClose={() => setAuditOpen(false)} />
    </>
  );
};

export default FieldsTable;
