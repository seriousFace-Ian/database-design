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
        // 触发器只显 value（如 INTEGER），弹层显完整 label（如 INTEGER（-2^31 ~ 2^31））
        optionLabelProp="value"
        popupMatchSelectWidth={false}
        dropdownStyle={{ minWidth: 240 }}
        // 主下拉仅列 PG 内置类型 + 一项通用 ENUM 入口；具体哪一个枚举由右侧第二下拉选择
        options={PG_TYPE_GROUPS.flatMap(g =>
          g.types.map(t => ({
            label: t.label,
            value: t.value,
            group: g.label,
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
          style={{ width: 140 }}
          placeholder="选择枚举"
          options={enumOptions}
          onChange={enumTypeId => onChange({ enumTypeId })}
          showSearch
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          dropdownStyle={{ minWidth: 200 }}
        />
      )}
    </Space>
  );
};

export default FieldTypeSelect;
