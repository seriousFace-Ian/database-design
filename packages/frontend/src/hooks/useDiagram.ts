import { useMemo } from 'react';
import type { TableFlowNode, FkFlowEdge } from '@/types/flow';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

const FALLBACK_COLS = 4;
const FALLBACK_GAP_X = 320;
const FALLBACK_GAP_Y = 280;

function fallbackPosition(index: number) {
  return {
    x: (index % FALLBACK_COLS) * FALLBACK_GAP_X,
    y: Math.floor(index / FALLBACK_COLS) * FALLBACK_GAP_Y,
  };
}

export function useDiagram(): { nodes: TableFlowNode[]; edges: FkFlowEdge[] } {
  const project = useProjectStore((s) => s.project);
  const selectedTableId = useUiStore((s) => s.selectedTableId);

  const nodes = useMemo<TableFlowNode[]>(() => {
    if (!project) return [];
    return project.tables.map((table, i) => ({
      id: table.id,
      type: 'tableNode',
      position: table.position ?? fallbackPosition(i),
      data: {
        table,
        isSelected: selectedTableId === table.id,
      },
    }));
  }, [project, selectedTableId]);

  const edges = useMemo<FkFlowEdge[]>(() => {
    if (!project) return [];

    // fieldId → 所属表与字段名，外键边渲染时需要
    const fieldIndex = new Map<string, { tableId: string; fieldName: string }>();
    for (const t of project.tables) {
      for (const f of t.fields) fieldIndex.set(f.id, { tableId: t.id, fieldName: f.name });
    }

    const result: FkFlowEdge[] = [];
    for (const t of project.tables) {
      for (const f of t.fields) {
        if (!f.foreignKey) continue;
        const target = fieldIndex.get(f.foreignKey.referenceFieldId);
        if (!target) continue; // 引用已失效，安静忽略
        result.push({
          id: `fk-${t.id}-${f.id}`,
          type: 'fkEdge',
          source: t.id,
          target: target.tableId,
          sourceHandle: f.id,
          targetHandle: f.foreignKey.referenceFieldId,
          data: {
            sourceFieldName: f.name,
            targetFieldName: target.fieldName,
            onDelete: f.foreignKey.onDelete,
            constraintName: f.foreignKey.constraintName,
          },
        });
      }
    }
    return result;
  }, [project]);

  return { nodes, edges };
}
