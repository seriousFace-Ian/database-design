import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { KeyOutlined, LinkOutlined, StarOutlined } from '@ant-design/icons';
import type { TableFlowNode } from '@/types/flow';
import { useUiStore } from '@/store/uiStore';

const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#1677ff',
  border: '1px solid #fff',
};

const TableNode: React.FC<NodeProps<TableFlowNode>> = ({ data }) => {
  const { table, isSelected } = data;
  const selectTable = useUiStore((s) => s.selectTable);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const handleHeaderDoubleClick = () => {
    selectTable(table.id);
    setActiveView('designer');
  };

  return (
    <div
      style={{
        background: '#fff',
        border: `2px solid ${isSelected ? '#1677ff' : '#d9d9d9'}`,
        borderRadius: 6,
        minWidth: 240,
        boxShadow: isSelected ? '0 0 0 4px rgba(22,119,255,0.12)' : '0 2px 8px rgba(0,0,0,0.06)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        overflow: 'hidden',
      }}
    >
      <div
        onDoubleClick={handleHeaderDoubleClick}
        style={{
          padding: '6px 10px',
          background: isSelected ? '#e6f4ff' : '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        title="双击：跳转到设计器编辑此表"
      >
        <span style={{ color: '#8c8c8c' }}>{table.schema}.</span>
        <span>{table.name}</span>
      </div>

      {table.fields.length === 0 ? (
        <div style={{ padding: '8px 10px', color: '#bfbfbf', fontSize: 12 }}>(无字段)</div>
      ) : (
        table.fields.map((f) => (
          <div
            key={f.id}
            style={{
              position: 'relative',
              padding: '4px 10px',
              fontSize: 12,
              borderBottom: '1px dashed #f5f5f5',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 22,
            }}
          >
            <Handle type="target" position={Position.Left} id={f.id} style={HANDLE_STYLE} />
            <span style={{ width: 14, textAlign: 'center', lineHeight: 1 }}>
              {f.isPrimaryKey ? (
                <KeyOutlined style={{ color: '#faad14' }} title="主键" />
              ) : f.foreignKey ? (
                <LinkOutlined style={{ color: '#1677ff' }} title="外键" />
              ) : f.isUnique ? (
                <StarOutlined style={{ color: '#52c41a' }} title="唯一" />
              ) : null}
            </span>
            <span style={{ flex: 1, color: f.isPrimaryKey ? '#262626' : '#595959' }}>
              {f.name}
              {!f.nullable && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
            </span>
            <span style={{ color: '#8c8c8c', fontSize: 11 }}>
              {f.type}
              {f.isArray ? '[]' : ''}
            </span>
            <Handle type="source" position={Position.Right} id={f.id} style={HANDLE_STYLE} />
          </div>
        ))
      )}
    </div>
  );
};

export default memo(TableNode);
