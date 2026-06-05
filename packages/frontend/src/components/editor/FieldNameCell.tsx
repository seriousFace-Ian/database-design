import React, { useState } from 'react';
import { Input, theme } from 'antd';
import type { FieldDefinition } from '@/types/schema';

interface Props {
  field: FieldDefinition;
  onChange: (name: string) => void;
}

const FieldNameCell: React.FC<Props> = ({ field, onChange }) => {
  const { token } = theme.useToken();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field.name);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== field.name) onChange(trimmed);
    else setValue(field.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        size="small"
        value={value}
        autoFocus
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onPressEnter={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setValue(field.name); setEditing(false); } }}
      />
    );
  }

  return (
    <span
      onClick={() => { setValue(field.name); setEditing(true); }}
      style={{
        cursor: 'text',
        display: 'block',
        padding: '1px 4px',
        borderRadius: 4,
        minHeight: 22,
        fontFamily: 'monospace',
        fontSize: 13,
        color: field.name ? token.colorText : token.colorTextPlaceholder,
      }}
    >
      {field.name || '点击编辑字段名'}
    </span>
  );
};

export default FieldNameCell;
