import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Checkbox, Select, Space, Typography, Tag, Divider, App } from 'antd';
import { useProjectStore } from '@/store/projectStore';
import {
  AUDIT_FIELD_CATALOG,
  AUDIT_GROUP_LABELS,
  AUDIT_OWNER_TYPES,
  auditFieldPreview,
  type AuditFieldKey,
  type AuditFieldGroup,
  type AuditOwnerType,
} from '@/utils/auditFields';
import type { TableDefinition } from '@/types/schema';

const { Text } = Typography;

interface Props {
  open: boolean;
  table: TableDefinition;
  onClose: () => void;
}

const GROUP_ORDER: AuditFieldGroup[] = ['timestamp', 'actor', 'extra'];

/** 一键审计字段弹窗：勾选要补齐的字段 + 选择操作者字段类型 */
const AuditFieldsModal: React.FC<Props> = ({ open, table, onClose }) => {
  const { message } = App.useApp();
  const { addAuditFields } = useProjectStore();

  const existingNames = useMemo(
    () => new Set(table.fields.map(f => f.name)),
    [table.fields]
  );

  const [ownerType, setOwnerType] = useState<AuditOwnerType>('BIGINT');
  const [checked, setChecked] = useState<Set<AuditFieldKey>>(new Set());

  // 每次打开：核心字段默认勾选，但已存在的不勾（会被跳过）；ownerType 保留上次选择
  useEffect(() => {
    if (!open) return;
    const init = new Set<AuditFieldKey>();
    for (const spec of AUDIT_FIELD_CATALOG) {
      if (spec.defaultChecked && !existingNames.has(spec.build(ownerType).name)) {
        init.add(spec.key);
      }
    }
    setChecked(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (key: AuditFieldKey, on: boolean) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleOk = () => {
    const keys = [...checked];
    if (keys.length === 0) {
      message.info('未选择任何字段');
      onClose();
      return;
    }
    const { added, skipped } = addAuditFields(table.id, { keys, ownerType });
    if (added.length > 0 && skipped.length > 0) {
      message.success(`已添加 ${added.join('、')}；已存在跳过 ${skipped.join('、')}`);
    } else if (added.length > 0) {
      message.success(`已添加 ${added.length} 个审计字段：${added.join('、')}`);
    } else {
      message.info(`所选字段均已存在：${skipped.join('、')}`);
    }
    onClose();
  };

  return (
    <Modal
      title="补齐审计字段"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="添加所选"
      width={580}
    >
      <div
        style={{
          margin: '4px 0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          操作者字段类型
        </Text>
        <Select
          size="small"
          value={ownerType}
          style={{ width: 110 }}
          onChange={setOwnerType}
          options={AUDIT_OWNER_TYPES.map(t => ({ value: t, label: t }))}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          应用于 *_by 字段，请与 users 表主键类型一致
        </Text>
      </div>

      {GROUP_ORDER.map(group => (
        <div key={group}>
          <Divider orientation="left" style={{ margin: '12px 0 8px' }}>
            <Text strong style={{ fontSize: 13 }}>
              {AUDIT_GROUP_LABELS[group]}
            </Text>
          </Divider>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {AUDIT_FIELD_CATALOG.filter(s => s.group === group).map(spec => {
              const proto = spec.build(ownerType);
              const exists = existingNames.has(proto.name);
              return (
                <div
                  key={spec.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Checkbox
                    checked={exists || checked.has(spec.key)}
                    disabled={exists}
                    onChange={e => toggle(spec.key, e.target.checked)}
                  >
                    <Text code>{proto.name}</Text>
                    {proto.comment && (
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                        {proto.comment}
                      </Text>
                    )}
                    {exists && (
                      <Tag style={{ marginLeft: 6 }}>已存在</Tag>
                    )}
                  </Checkbox>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}
                  >
                    {auditFieldPreview(proto)}
                  </Text>
                </div>
              );
            })}
          </Space>
        </div>
      ))}
    </Modal>
  );
};

export default AuditFieldsModal;
