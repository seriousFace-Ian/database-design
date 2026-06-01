import React, { useEffect } from 'react';
import { Modal, Form, Input, Button, Space, Typography } from 'antd';
import { useProjectStore } from '@/store/projectStore';
import type { FieldDefinition } from '@/types/schema';

const { Text } = Typography;

interface Props {
  open: boolean;
  tableId: string;
  field: FieldDefinition;
  onClose: () => void;
}

/** 列级 CHECK 约束编辑器：输入裸 SQL 布尔表达式，生成时包裹为 CHECK (...) */
const ConstraintConfig: React.FC<Props> = ({ open, tableId, field, onClose }) => {
  const { updateField } = useProjectStore();
  const [form] = Form.useForm<{ checkConstraint: string }>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ checkConstraint: field.checkConstraint ?? '' });
    }
  }, [open, field.id, field.checkConstraint, form]);

  const handleSave = async () => {
    const { checkConstraint } = await form.validateFields();
    const trimmed = checkConstraint.trim();
    updateField(tableId, field.id, { checkConstraint: trimmed || undefined });
    onClose();
  };

  const handleClear = () => {
    updateField(tableId, field.id, { checkConstraint: undefined });
    onClose();
  };

  return (
    <Modal
      title={`CHECK 约束 — ${field.name}`}
      open={open}
      onCancel={onClose}
      width={480}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button danger onClick={handleClear} disabled={!field.checkConstraint}>
            清除约束
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
          name="checkConstraint"
          label="布尔表达式"
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              只填表达式本身，无需写 CHECK 与括号。例如：<code>{field.name} &gt;= 0</code>
            </Text>
          }
        >
          <Input.TextArea
            rows={3}
            placeholder={`${field.name} >= 0`}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConstraintConfig;
