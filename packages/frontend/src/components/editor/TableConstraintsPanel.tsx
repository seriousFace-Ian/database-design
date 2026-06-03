import React, { useState } from 'react';
import {
  Button,
  Empty,
  Space,
  Tag,
  Tooltip,
  Modal,
  Form,
  Input,
  Select,
  App,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import type {
  TableDefinition,
  TableConstraint,
  TableConstraintKind,
} from '@/types/schema';

const { Text } = Typography;

interface Props {
  table: TableDefinition;
}

const TableConstraintsPanel: React.FC<Props> = ({ table }) => {
  const { addTableConstraint, updateTableConstraint, deleteTableConstraint } = useProjectStore();
  const { modal } = App.useApp();
  const [editing, setEditing] = useState<{ kind: TableConstraintKind; existing?: TableConstraint } | null>(null);

  const constraints = table.constraints ?? [];
  const fieldName = (id: string) => table.fields.find(f => f.id === id)?.name ?? '?';

  const handleDelete = (c: TableConstraint) => {
    modal.confirm({
      title: `删除约束 ${c.name ?? '(未命名)'}？`,
      content: c.kind === 'UNIQUE'
        ? `将删除 UNIQUE (${(c.fieldIds ?? []).map(fieldName).join(', ')})`
        : `将删除 CHECK (${c.expression})`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteTableConstraint(table.id, c.id),
    });
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button
          icon={<PlusOutlined />}
          onClick={() => setEditing({ kind: 'UNIQUE' })}
        >
          添加 UNIQUE
        </Button>
        <Button
          icon={<PlusOutlined />}
          onClick={() => setEditing({ kind: 'CHECK' })}
        >
          添加 CHECK
        </Button>
      </Space>

      {constraints.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有表级约束。组合 UNIQUE 或跨列 CHECK 可在此添加。"
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {constraints.map(c => (
            <div
              key={c.id}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                padding: '8px 12px',
                background: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Space size={8} style={{ flex: 1, minWidth: 0 }}>
                {c.kind === 'UNIQUE' ? (
                  <Tag color="green" icon={<KeyOutlined />}>UNIQUE</Tag>
                ) : (
                  <Tag color="purple" icon={<CheckCircleOutlined />}>CHECK</Tag>
                )}
                <Text strong style={{ minWidth: 0 }}>{c.name ?? <Text type="secondary">(自动命名)</Text>}</Text>
                <Text
                  type="secondary"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 380,
                  }}
                >
                  {c.kind === 'UNIQUE'
                    ? `(${(c.fieldIds ?? []).map(fieldName).join(', ')})`
                    : `(${c.expression})`}
                </Text>
              </Space>
              <Space size={2}>
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => setEditing({ kind: c.kind, existing: c })}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(c)}
                  />
                </Tooltip>
              </Space>
            </div>
          ))}
        </Space>
      )}

      {editing && (
        <ConstraintEditModal
          table={table}
          kind={editing.kind}
          existing={editing.existing}
          onSave={(values) => {
            if (editing.existing) {
              updateTableConstraint(table.id, editing.existing.id, values);
            } else {
              addTableConstraint(table.id, values);
            }
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

// ==================== 编辑/添加 Modal ====================

interface ModalProps {
  table: TableDefinition;
  kind: TableConstraintKind;
  existing?: TableConstraint;
  onSave: (values: Omit<TableConstraint, 'id'>) => void;
  onClose: () => void;
}

interface FormValues {
  name?: string;
  fieldIds?: string[];
  expression?: string;
}

const ConstraintEditModal: React.FC<ModalProps> = ({ table, kind, existing, onSave, onClose }) => {
  const [form] = Form.useForm<FormValues>();

  React.useEffect(() => {
    form.setFieldsValue({
      name: existing?.name ?? '',
      fieldIds: existing?.fieldIds ?? [],
      expression: existing?.expression ?? '',
    });
  }, [existing, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSave({
      kind,
      name: values.name?.trim() || undefined,
      fieldIds: kind === 'UNIQUE' ? values.fieldIds : (values.fieldIds && values.fieldIds.length > 0 ? values.fieldIds : undefined),
      expression: kind === 'CHECK' ? values.expression?.trim() : undefined,
    });
  };

  return (
    <Modal
      title={`${existing ? '编辑' : '添加'} ${kind} 约束`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      width={520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="约束名（可选）"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              省略时自动生成：{kind === 'UNIQUE' ? `uq_${table.name}_<col1>_<col2>` : `chk_${table.name}_<hash>`}
            </Text>
          }
        >
          <Input placeholder={kind === 'UNIQUE' ? 'uq_users_team_role' : 'chk_events_dates'} />
        </Form.Item>

        {kind === 'UNIQUE' ? (
          <Form.Item
            name="fieldIds"
            label="字段"
            rules={[
              { required: true, message: '请选择字段' },
              {
                validator: (_, value: string[]) =>
                  value && value.length >= 2
                    ? Promise.resolve()
                    : Promise.reject(new Error('组合 UNIQUE 至少需要 2 个字段（单列请直接在字段表勾选「唯一」）')),
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder="选择 2 个或更多字段"
              options={table.fields.map(f => ({ label: f.name, value: f.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              name="expression"
              label="布尔表达式"
              rules={[{ required: true, message: '请输入表达式' }]}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  只填表达式本身，无需写 CHECK 与外层括号。可引用任意字段：
                  <code> start_date &lt; end_date </code> 或 <code> total = price * quantity </code>
                </Text>
              }
            >
              <Input.TextArea rows={3} style={{ fontFamily: 'monospace' }} placeholder="start_date < end_date" />
            </Form.Item>
            <Form.Item name="fieldIds" label="关联字段（可选，仅作元信息）">
              <Select
                mode="multiple"
                placeholder="标注此 CHECK 引用了哪些字段"
                options={table.fields.map(f => ({ label: f.name, value: f.id }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
};

export default TableConstraintsPanel;
