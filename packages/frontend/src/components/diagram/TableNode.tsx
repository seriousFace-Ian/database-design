import {memo} from 'react'

import {KeyOutlined, LinkOutlined, StarOutlined} from '@ant-design/icons'
import {Handle, type NodeProps, Position} from '@xyflow/react'
import {theme} from 'antd'
import type React from 'react'

import {useUiStore} from '@/store/uiStore'
import type {TableFlowNode} from '@/types/flow'

const TableNode: React.FC<NodeProps<TableFlowNode>> = ({data}) => {
  const {table, isSelected} = data
  const selectTable = useUiStore(s => s.selectTable)
  const setActiveView = useUiStore(s => s.setActiveView)
  const {token} = theme.useToken()

  const handleStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    background: token.colorPrimary,
    border: `1px solid ${token.colorBgContainer}`,
  }

  const handleHeaderDoubleClick = () => {
    selectTable(table.id)
    setActiveView('designer')
  }

  return (
    <div
      style={{
        background: token.colorBgContainer,
        border: `2px solid ${isSelected ? token.colorPrimary : token.colorBorder}`,
        borderRadius: 6,
        minWidth: 240,
        boxShadow: isSelected
          ? `0 0 0 4px ${token.colorPrimaryBg}`
          : `0 2px 8px ${token.colorFillTertiary}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          background: isSelected ? token.colorPrimaryBg : token.colorFillQuaternary,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          fontWeight: 600,
          fontSize: 13,
          color: token.colorText,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        title="双击：跳转到设计器编辑此表"
        onDoubleClick={handleHeaderDoubleClick}
      >
        <span style={{color: token.colorTextSecondary}}>{table.schema}.</span>
        <span>{table.name}</span>
      </div>

      {table.fields.length === 0 ? (
        <div style={{padding: '8px 10px', color: token.colorTextDisabled, fontSize: 12}}>
          (无字段)
        </div>
      ) : (
        table.fields.map(f => (
          <div
            key={f.id}
            style={{
              position: 'relative',
              padding: '4px 10px',
              fontSize: 12,
              borderBottom: `1px dashed ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 22,
            }}
          >
            <Handle id={f.id} position={Position.Left} style={handleStyle} type="target" />
            <span style={{width: 14, textAlign: 'center', lineHeight: 1}}>
              {f.isPrimaryKey ? (
                <KeyOutlined style={{color: token.colorWarning}} title="主键" />
              ) : f.foreignKey ? (
                <LinkOutlined style={{color: token.colorPrimary}} title="外键" />
              ) : f.isUnique ? (
                <StarOutlined style={{color: token.colorSuccess}} title="唯一" />
              ) : null}
            </span>
            <span
              style={{flex: 1, color: f.isPrimaryKey ? token.colorText : token.colorTextSecondary}}
            >
              {f.name}
              {!f.nullable && <span style={{color: token.colorError, marginLeft: 4}}>*</span>}
            </span>
            <span style={{color: token.colorTextTertiary, fontSize: 11}}>
              {f.type}
              {f.isArray ? '[]' : ''}
            </span>
            <Handle id={f.id} position={Position.Right} style={handleStyle} type="source" />
          </div>
        ))
      )}
    </div>
  )
}

export default memo(TableNode)
