import {InputNumber, Select, Space} from 'antd'
import type React from 'react'

import type {EnumType, FieldDefinition, PgFieldType} from '@/types/schema'
import {PG_TYPE_GROUPS, typeHasLength, typeHasPrecision} from '@/utils/typeDefinitions'

interface Props {
  field: FieldDefinition
  enums: EnumType[]
  onChange: (changes: Partial<FieldDefinition>) => void
}

const FieldTypeSelect: React.FC<Props> = ({field, enums, onChange}) => {
  const handleTypeChange = (type: PgFieldType) => {
    const changes: Partial<FieldDefinition> = {type}
    // 切换类型时清理关联属性
    if (!typeHasLength(type)) changes.length = undefined
    if (!typeHasPrecision(type)) {
      changes.precision = undefined
      changes.scale = undefined
    }
    if (type !== 'USER-DEFINED') changes.enumTypeId = undefined
    onChange(changes)
  }

  const enumOptions = enums.map(e => ({
    value: e.id,
    label: `${e.schema}.${e.name}`,
  }))

  return (
    <Space size={4} style={{width: '100%'}}>
      <Select
        showSearch
        dropdownStyle={{minWidth: 240}}
        optionFilterProp="label"
        // 触发器只显 value（如 INTEGER），弹层显完整 label（如 INTEGER（-2^31 ~ 2^31））
        optionLabelProp="value"
        // 主下拉仅列 PG 内置类型 + 一项通用 ENUM 入口；具体哪一个枚举由右侧第二下拉选择
        options={PG_TYPE_GROUPS.flatMap(g =>
          g.types.map(t => ({
            label: t.label,
            value: t.value,
            group: g.label,
          }))
        )}
        popupMatchSelectWidth={false}
        size="small"
        style={{width: 150}}
        value={field.type}
        onChange={handleTypeChange}
      />

      {/* VARCHAR/CHAR 长度 */}
      {typeHasLength(field.type) && (
        <InputNumber
          max={65535}
          min={1}
          placeholder="长度"
          size="small"
          style={{width: 72}}
          value={field.length}
          onChange={v => onChange({length: v ?? undefined})}
        />
      )}

      {/* NUMERIC 精度 */}
      {typeHasPrecision(field.type) && (
        <Space size={2}>
          <InputNumber
            max={1000}
            min={1}
            placeholder="精度"
            size="small"
            style={{width: 60}}
            value={field.precision}
            onChange={v => onChange({precision: v ?? undefined})}
          />
          <InputNumber
            max={1000}
            min={0}
            placeholder="小数"
            size="small"
            style={{width: 60}}
            value={field.scale}
            onChange={v => onChange({scale: v ?? undefined})}
          />
        </Space>
      )}

      {/* USER-DEFINED: 选择具体 ENUM */}
      {field.type === 'USER-DEFINED' && (
        <Select
          showSearch
          dropdownStyle={{minWidth: 200}}
          optionFilterProp="label"
          options={enumOptions}
          placeholder="选择枚举"
          popupMatchSelectWidth={false}
          size="small"
          style={{width: 140}}
          value={field.enumTypeId}
          onChange={enumTypeId => onChange({enumTypeId})}
        />
      )}
    </Space>
  )
}

export default FieldTypeSelect
