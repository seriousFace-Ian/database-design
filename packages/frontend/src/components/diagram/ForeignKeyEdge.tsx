import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { Tooltip, theme } from 'antd';
import type { FkFlowEdge } from '@/types/flow';

const ForeignKeyEdge: React.FC<EdgeProps<FkFlowEdge>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}) => {
  const { token } = theme.useToken();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? token.colorPrimary : token.colorTextSecondary,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {data && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <Tooltip
              title={
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <div>
                    <strong>{data.constraintName ?? '(未命名约束)'}</strong>
                  </div>
                  <div>
                    {data.sourceFieldName} → {data.targetFieldName}
                  </div>
                  <div>ON DELETE: {data.onDelete}</div>
                </div>
              }
            >
              <span
                style={{
                  background: token.colorBgElevated,
                  border: `1px solid ${token.colorBorder}`,
                  borderRadius: 10,
                  padding: '0 6px',
                  fontSize: 10,
                  color: token.colorTextSecondary,
                  cursor: 'help',
                  userSelect: 'none',
                  lineHeight: '16px',
                  display: 'inline-block',
                }}
              >
                FK
              </span>
            </Tooltip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default ForeignKeyEdge;
