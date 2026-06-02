import dagre from '@dagrejs/dagre';
import type { TableFlowNode, FkFlowEdge } from '@/types/flow';

const NODE_WIDTH = 260;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 36;

function estimateHeight(fieldCount: number): number {
  return HEADER_HEIGHT + Math.max(fieldCount, 1) * ROW_HEIGHT;
}

/**
 * 用 dagre 计算从左到右的层级布局。
 * 返回 tableId → 节点左上角坐标的映射，由调用方写回 projectStore.updateTablePosition。
 */
export function computeLayout(
  nodes: TableFlowNode[],
  edges: FkFlowEdge[]
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 });

  for (const n of nodes) {
    g.setNode(n.id, {
      width: NODE_WIDTH,
      height: estimateHeight(n.data.table.fields.length),
    });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const dn = g.node(n.id);
    if (!dn) continue;
    // dagre 返回的是节点中心，React Flow 用左上角
    positions[n.id] = {
      x: dn.x - NODE_WIDTH / 2,
      y: dn.y - estimateHeight(n.data.table.fields.length) / 2,
    };
  }
  return positions;
}
