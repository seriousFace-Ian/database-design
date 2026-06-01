import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Input, Button, Space } from 'antd';
import { useProjectStore } from '@/store/projectStore';
import type { ForeignKeyConfig, FkAction, FieldDefinition } from '@/types/schema';

const FK_ACTIONS: { value: FkAction; label: string }[] = [
  { value: 'NO ACTION', label: 'NO ACTION' },
  { value: 'RESTRICT', label: 'RESTRICT' },
  { value: 'CASCADE', label: 'CASCADE' },
  { value: 'SET NULL', label: 'SET NULL' },
  { value: 'SET DEFAULT', label: 'SET DEFAULT' },
];

interface Props {
  open: boolean;
  tableId: string;
  field: FieldDefinition;
  onClose: () => void;
}

const ForeignKeyModal: React.FC<Props> = ({ open, tableId, field, onClose }) => {
  const { project, updateField } = useProjectStore();
  const [form] = Form.useForm();
  const [refTableId, setRefTableId] = useState<string | undefined>();

  const tables = project?.tables.filter(t => t.id !== tableId) ?? [];
  const refTable = tables.find(t => t.id === refTableId);

  useEffect(() => {
    if (open) {
      const fk = field.foreignKey;
      setRefTableId(fk?.referenceTableId);
      form.setFieldsValue({
        referenceTableId: fk?.referenceTableId,
        referenceFieldId: fk?.referenceFieldId,
        onDelete: fk?.onDelete ?? 'NO ACTION',
        onUpdate: fk?.onUpdate ?? 'NO ACTION',
        constraintName: fk?.constraintName ?? '',
      });
    }
  }, [open, field.id, field.foreignKey, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    updateField(tableId, field.id, {
      foreignKey: {
        referenceTableId: values.referenceTableId,
        referenceFieldId: values.referenceFieldId,
        onDelete: values.onDelete,
        onUpdate: values.onUpdate,
        constraintName: values.constraintName || undefined,
      } as ForeignKeyConfig,
    });
    onClose();
  };

  const handleClear = () => {
    updateField(tableId, field.id, { foreignKey: undefined });
    onClose();
  };

  return (
    <Modal
      title={`配置外键 — ${field.name}`}
      open={open}
      onCancel={onClose}
      width={480}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button danger onClick={handleClear} disabled={!field.foreignKey}>
            清除外键
          </Button>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        </div>
      }
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="referenceTableId"
          label="引用表"
          rules={[{ required: true, message: '请选择引用表' }]}
        >
          <Select
            placeholder="选择引用表"
            showSearch
            optionFilterProp="label"
            options={tables.map(t => ({ value: t.id, label: `${t.schema}.${t.name}` }))}
            onChange={(v) => {
              setRefTableId(v);
              form.setFieldValue('referenceFieldId', undefined);
            }}
          />
        </Form.Item>
        <Form.Item
          name="referenceFieldId"
          label="引用字段"
          rules={[{ required: true, message: '请选择引用字段' }]}
        >
          <Select
            placeholder="选择引用字段"
            disabled={!refTableId}
            options={(refTable?.fields ?? []).map(f => ({ value: f.id, label: f.name }))}
          />
        </Form.Item>
        <Space style={{ width: '100%' }} size={16}>
          <Form.Item name="onDelete" label="ON DELETE" style={{ flex: 1, minWidth: 180 }}>
            <Select options={FK_ACTIONS} />
          </Form.Item>
          <Form.Item name="onUpdate" label="ON UPDATE" style={{ flex: 1, minWidth: 180 }}>
            <Select options={FK_ACTIONS} />
          </Form.Item>
        </Space>
        <Form.Item name="constraintName" label="约束名（可选）">
          <Input placeholder="fk_orders_user_id" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ForeignKeyModal;
