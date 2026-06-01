import React from 'react';
import { Select, Space, InputNumber } from 'antd';
import { PG_TYPE_GROUPS, typeHasLength, typeHasPrecision } from '@/utils/typeDefinitions';
import type { FieldDefinition, EnumType, PgFieldType } from '@/types/schema';

interface Props {
  field: FieldDefinition;
  enums: EnumType[];
  onChange: (changes: Partial<FieldDefinition>) => void;
}

const FieldTypeSelect: React.FC<Props> = ({ field, enums, onChange }) => {
  const handleTypeChange = (type: PgFieldType) => {
    const changes: Partial<FieldDefinition> = { type };
    // 切换类型时清理关联属性
    if (!typeHasLength(type)) changes.length = undefined;
    if (!typeHasPrecision(type)) { changes.precision = undefined; changes.scale = undefined; }
    if (type !== 'USER-DEFINED') changes.enumTypeId = undefined;
    onChange(changes);
  };

  const enumOptions = enums.map(e => ({
    value: e.id,
    label: `${e.schema}.${e.name}`,
  }));

  return (
    <Space size={4} style={{ width: '100%' }}>
      <Select
        value={field.type}
        size="small"
        style={{ width: 150 }}
        onChange={handleTypeChange}
        showSearch
        optionFilterProp="label"
        options={PG_TYPE_GROUPS.flatMap(g =>
          g.types.map(t => ({
            label: t.label,
            value: t.value,
            group: g.label,
          }))
        ).concat(
          enums.map(e => ({
            label: `${e.name} (ENUM)`,
            value: 'USER-DEFINED' as PgFieldType,
            group: '自定义枚举',
          }))
        )}
      />

      {/* VARCHAR/CHAR 长度 */}
      {typeHasLength(field.type) && (
        <InputNumber
          size="small"
          value={field.length}
          min={1}
          max={65535}
          placeholder="长度"
          style={{ width: 72 }}
          onChange={v => onChange({ length: v ?? undefined })}
        />
      )}

      {/* NUMERIC 精度 */}
      {typeHasPrecision(field.type) && (
        <Space size={2}>
          <InputNumber
            size="small"
            value={field.precision}
            min={1}
            max={1000}
            placeholder="精度"
            style={{ width: 60 }}
            onChange={v => onChange({ precision: v ?? undefined })}
          />
          <InputNumber
            size="small"
            value={field.scale}
            min={0}
            max={1000}
            placeholder="小数"
            style={{ width: 60 }}
            onChange={v => onChange({ scale: v ?? undefined })}
          />
        </Space>
      )}

      {/* USER-DEFINED: 选择具体 ENUM */}
      {field.type === 'USER-DEFINED' && (
        <Select
          size="small"
          value={field.enumTypeId}
          style={{ width: 120 }}
          placeholder="选择枚举"
          options={enumOptions}
          onChange={enumTypeId => onChange({ enumTypeId })}
        />
      )}
    </Space>
  );
};

export default FieldTypeSelect;
