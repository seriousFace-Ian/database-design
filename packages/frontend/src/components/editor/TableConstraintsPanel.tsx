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
  Checkbox,
  App,
  Typography,
  Collapse,
  theme,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import type {
  TableDefinition,
  TableConstraint,
  TableConstraintKind,
  ExclusionElement,
  ExclusionIndexMethod,
} from '@/types/schema';

const { Text } = Typography;

const EXCLUSION_METHODS: { value: ExclusionIndexMethod; label: string }[] = [
  { value: 'GIST', label: 'GIST（默认；范围/几何/相等需 btree_gist 扩展）' },
  { value: 'SPGIST', label: 'SPGIST' },
  { value: 'BTREE', label: 'BTREE' },
  { value: 'HASH', label: 'HASH' },
];

const EXCLUSION_OPERATOR_PRESETS = ['=', '<>', '&&', '@>', '<@', '||'];

interface Props {
  table: TableDefinition;
}

const TableConstraintsPanel: React.FC<Props> = ({ table }) => {
  const { addTableConstraint, updateTableConstraint, deleteTableConstraint } = useProjectStore();
  const { modal } = App.useApp();
  const { token } = theme.useToken();
  const [editing, setEditing] = useState<{ kind: TableConstraintKind; existing?: TableConstraint } | null>(null);

  const constraints = table.constraints ?? [];
  const fieldName = (id: string) => table.fields.find(f => f.id === id)?.name ?? '?';

  const handleDelete = (c: TableConstraint) => {
    modal.confirm({
      title: `删除约束 ${c.name ?? '(未命名)'}？`,
      content:
        c.kind === 'UNIQUE'
          ? `将删除 UNIQUE (${(c.fieldIds ?? []).map(fieldName).join(', ')})`
          : c.kind === 'CHECK'
            ? `将删除 CHECK (${c.expression})`
            : `将删除 EXCLUDE USING ${c.exclusionUsing ?? 'GIST'} (...)`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteTableConstraint(table.id, c.id),
    });
  };

  const renderPreview = (c: TableConstraint): string => {
    if (c.kind === 'UNIQUE') {
      return `(${(c.fieldIds ?? []).map(fieldName).join(', ')})`;
    }
    if (c.kind === 'CHECK') {
      return `(${c.expression})`;
    }
    const els = (c.exclusionElements ?? [])
      .map(el => {
        const head = el.fieldId ? fieldName(el.fieldId) : (el.expression ?? '');
        return `${head} WITH ${el.operator}`;
      })
      .join(', ');
    const where = c.exclusionWhere?.trim() ? ` WHERE (${c.exclusionWhere.trim()})` : '';
    return `USING ${c.exclusionUsing ?? 'GIST'} (${els})${where}`;
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'UNIQUE' })}>
          添加 UNIQUE
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'CHECK' })}>
          添加 CHECK
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => setEditing({ kind: 'EXCLUDE' })}>
          添加 EXCLUDE
        </Button>
      </Space>

      {constraints.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有表级约束。组合 UNIQUE / 跨列 CHECK / EXCLUDE 排斥约束可在此添加。"
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {constraints.map(c => (
            <div
              key={c.id}
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
              <Space size={8} style={{ flex: 1, minWidth: 0 }}>
                {c.kind === 'UNIQUE' && <Tag color="green" icon={<KeyOutlined />}>UNIQUE</Tag>}
                {c.kind === 'CHECK' && <Tag color="purple" icon={<CheckCircleOutlined />}>CHECK</Tag>}
                {c.kind === 'EXCLUDE' && (
                  <Tag color="orange" icon={<ExclamationCircleOutlined />}>EXCLUDE</Tag>
                )}
                <Text strong style={{ minWidth: 0 }}>
                  {c.name ?? <Text type="secondary">(自动命名)</Text>}
                </Text>
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
                  {renderPreview(c)}
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
  // EXCLUDE
  exclusionUsing?: ExclusionIndexMethod;
  exclusionWhere?: string;
  exclusionDeferrable?: boolean;
  exclusionInitiallyDeferred?: boolean;
}

type EditableExclusionElement = ExclusionElement & { mode: 'field' | 'expression' };

const ConstraintEditModal: React.FC<ModalProps> = ({ table, kind, existing, onSave, onClose }) => {
  const [form] = Form.useForm<FormValues>();
  const [excludeElements, setExcludeElements] = useState<EditableExclusionElement[]>(() =>
    kind === 'EXCLUDE'
      ? (existing?.exclusionElements ?? [{ fieldId: undefined, operator: '=' }]).map(el => ({
          ...el,
          mode: el.fieldId ? 'field' : 'expression',
        }))
      : []
  );
  const [excludeError, setExcludeError] = useState<string | null>(null);

  React.useEffect(() => {
    form.setFieldsValue({
      name: existing?.name ?? '',
      fieldIds: existing?.fieldIds ?? [],
      expression: existing?.expression ?? '',
      exclusionUsing: existing?.exclusionUsing ?? 'GIST',
      exclusionWhere: existing?.exclusionWhere ?? '',
      exclusionDeferrable: existing?.exclusionDeferrable ?? false,
      exclusionInitiallyDeferred: existing?.exclusionInitiallyDeferred ?? false,
    });
  }, [existing, form]);

  const validateExclusion = (els: EditableExclusionElement[]): string | null => {
    if (els.length === 0) return '至少需要 1 个元素';
    for (const el of els) {
      if (el.mode === 'field' && !el.fieldId) return '所有"字段"模式的行必须选择字段';
      if (el.mode === 'expression' && !el.expression?.trim()) {
        return '所有"表达式"模式的行必须填写表达式';
      }
      if (!el.operator?.trim()) return '所有元素必须填写操作符';
    }
    return null;
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    if (kind === 'EXCLUDE') {
      const err = validateExclusion(excludeElements);
      if (err) {
        setExcludeError(err);
        return;
      }
      setExcludeError(null);
      const cleaned: ExclusionElement[] = excludeElements.map(el => ({
        ...(el.mode === 'field' ? { fieldId: el.fieldId } : { expression: el.expression?.trim() }),
        operator: el.operator.trim(),
      }));
      onSave({
        kind: 'EXCLUDE',
        name: values.name?.trim() || undefined,
        exclusionElements: cleaned,
        exclusionUsing: values.exclusionUsing ?? 'GIST',
        exclusionWhere: values.exclusionWhere?.trim() || undefined,
        exclusionDeferrable: !!values.exclusionDeferrable,
        exclusionInitiallyDeferred: !!values.exclusionDeferrable && !!values.exclusionInitiallyDeferred,
      });
      return;
    }
    onSave({
      kind,
      name: values.name?.trim() || undefined,
      fieldIds: kind === 'UNIQUE'
        ? values.fieldIds
        : (values.fieldIds && values.fieldIds.length > 0 ? values.fieldIds : undefined),
      expression: kind === 'CHECK' ? values.expression?.trim() : undefined,
    });
  };

  const moveEl = (from: number, to: number) => {
    if (to < 0 || to >= excludeElements.length) return;
    const next = [...excludeElements];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setExcludeElements(next);
  };

  const updateEl = (idx: number, changes: Partial<EditableExclusionElement>) => {
    setExcludeElements(prev => prev.map((el, i) => (i === idx ? { ...el, ...changes } : el)));
  };

  const usingValue = Form.useWatch('exclusionUsing', form);
  const showBtreeGistHint =
    kind === 'EXCLUDE' &&
    (usingValue ?? 'GIST') === 'GIST' &&
    excludeElements.some(el => ['=', '<>'].includes(el.operator?.trim()));

  return (
    <Modal
      title={`${existing ? '编辑' : '添加'} ${kind} 约束`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      width={kind === 'EXCLUDE' ? 720 : 520}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="约束名（可选）"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              省略时自动生成：
              {kind === 'UNIQUE'
                ? `uq_${table.name}_<col1>_<col2>`
                : kind === 'CHECK'
                  ? `chk_${table.name}_<hash>`
                  : `ex_${table.name}_<col1>_<col2>`}
            </Text>
          }
        >
          <Input
            placeholder={
              kind === 'UNIQUE'
                ? 'uq_users_team_role'
                : kind === 'CHECK'
                  ? 'chk_events_dates'
                  : 'bookings_no_overlap'
            }
          />
        </Form.Item>

        {kind === 'UNIQUE' && (
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
        )}

        {kind === 'CHECK' && (
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

        {kind === 'EXCLUDE' && (
          <>
            <Form.Item name="exclusionUsing" label="索引方法">
              <Select style={{ width: 320 }} options={EXCLUSION_METHODS} />
            </Form.Item>

            <Form.Item label="元素（至少 1 个）">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {excludeElements.map((el, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px dashed #d9d9d9',
                      borderRadius: 6,
                      padding: 8,
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <Select
                      size="small"
                      style={{ width: 90 }}
                      value={el.mode}
                      onChange={v =>
                        updateEl(i, { mode: v, fieldId: undefined, expression: undefined })
                      }
                      options={[
                        { label: '字段', value: 'field' },
                        { label: '表达式', value: 'expression' },
                      ]}
                    />
                    {el.mode === 'field' ? (
                      <Select
                        size="small"
                        style={{ width: 200 }}
                        placeholder="选择字段"
                        value={el.fieldId}
                        onChange={v => updateEl(i, { fieldId: v })}
                        options={table.fields.map(f => ({ label: f.name, value: f.id }))}
                        showSearch
                        optionFilterProp="label"
                      />
                    ) : (
                      <Input
                        size="small"
                        style={{ width: 240, fontFamily: 'monospace' }}
                        placeholder="LOWER(name)"
                        value={el.expression ?? ''}
                        onChange={e => updateEl(i, { expression: e.target.value })}
                      />
                    )}
                    <Text style={{ marginLeft: 4 }}>WITH</Text>
                    <Select
                      size="small"
                      style={{ width: 100 }}
                      value={el.operator}
                      onChange={v => updateEl(i, { operator: v })}
                      options={EXCLUSION_OPERATOR_PRESETS.map(op => ({ label: op, value: op }))}
                      showSearch
                      mode="tags"
                      maxCount={1}
                    />
                    <Space size={2}>
                      <Tooltip title="上移">
                        <Button
                          size="small"
                          type="text"
                          icon={<ArrowUpOutlined />}
                          disabled={i === 0}
                          onClick={() => moveEl(i, i - 1)}
                        />
                      </Tooltip>
                      <Tooltip title="下移">
                        <Button
                          size="small"
                          type="text"
                          icon={<ArrowDownOutlined />}
                          disabled={i === excludeElements.length - 1}
                          onClick={() => moveEl(i, i + 1)}
                        />
                      </Tooltip>
                      <Tooltip title="删除该元素">
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={excludeElements.length === 1}
                          onClick={() => setExcludeElements(prev => prev.filter((_, x) => x !== i))}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                ))}
                <Button
                  size="small"
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setExcludeElements(prev => [...prev, { mode: 'field', operator: '&&' }])
                  }
                >
                  添加元素
                </Button>
                {showBtreeGistHint && (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    GIST + 等号/不等号操作符需要启用 <code>btree_gist</code> 扩展（CREATE EXTENSION btree_gist）。
                  </Text>
                )}
                {excludeError && (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    {excludeError}
                  </Text>
                )}
              </Space>
            </Form.Item>

            <Form.Item
              name="exclusionWhere"
              label="WHERE 谓词（可选）"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  只填表达式本身，无需写 WHERE 关键字。例如：<code>active</code>
                </Text>
              }
            >
              <Input.TextArea rows={2} style={{ fontFamily: 'monospace' }} placeholder="active" />
            </Form.Item>

            <Collapse
              size="small"
              items={[
                {
                  key: 'advanced',
                  label: '高级选项',
                  children: (
                    <Space direction="vertical">
                      <Form.Item name="exclusionDeferrable" valuePropName="checked" noStyle>
                        <Checkbox>DEFERRABLE（允许延迟到事务结束再检查）</Checkbox>
                      </Form.Item>
                      <Form.Item name="exclusionInitiallyDeferred" valuePropName="checked" noStyle>
                        <Checkbox>INITIALLY DEFERRED（默认延迟，需先勾选 DEFERRABLE）</Checkbox>
                      </Form.Item>
                    </Space>
                  ),
                },
              ]}
            />
          </>
        )}
      </Form>
    </Modal>
  );
};

export default TableConstraintsPanel;
