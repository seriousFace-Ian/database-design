import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  applyNodeChanges,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { App, Button, Space, Tooltip, Empty } from 'antd';
import {
  ApartmentOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import TableNode from './TableNode';
import ForeignKeyEdge from './ForeignKeyEdge';
import { useDiagram } from '@/hooks/useDiagram';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { computeLayout } from '@/utils/layoutEngine';
import type { TableFlowNode } from '@/types/flow';

const nodeTypes = { tableNode: TableNode } as unknown as NodeTypes;
const edgeTypes = { fkEdge: ForeignKeyEdge } as unknown as EdgeTypes;
const DEFAULT_EDGE_OPTIONS = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8c8c8c', width: 18, height: 18 },
};

const Inner: React.FC<{ fullscreen: boolean; onToggleFullscreen: () => void }> = ({
  fullscreen,
  onToggleFullscreen,
}) => {
  const { message } = App.useApp();
  const { nodes: derivedNodes, edges } = useDiagram();
  const project = useProjectStore((s) => s.project);
  const updateTablePosition = useProjectStore((s) => s.updateTablePosition);
  const updateDiagramLayout = useProjectStore((s) => s.updateDiagramLayout);
  const selectTable = useUiStore((s) => s.selectTable);
  const { fitView, setViewport } = useReactFlow();

  // 本地节点状态：拖拽过程中只更新本地副本，拖拽结束才回写 store(避免大量更新)
  const [nodes, setNodes] = useState<TableFlowNode[]>(derivedNodes);

  // 当 project / 选中态变化时把派生节点同步过来。
  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes]);

  // 初次加载时恢复保存的视口
  useEffect(() => {
    if (project?.diagramLayout) {
      setViewport(
        {
          x: project.diagramLayout.position.x,
          y: project.diagramLayout.position.y,
          zoom: project.diagramLayout.zoom,
        },
        { duration: 0 }
      );
    }
    // 仅在挂载或换 project 时同步一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.name]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as TableFlowNode[]);
      // 拖拽结束时把最终位置写回 store
      for (const c of changes) {
        if (c.type === 'position' && c.dragging === false && c.position) {
          updateTablePosition(c.id, c.position);
        }
      }
    },
    [updateTablePosition]
  );

  const onMoveEnd = useCallback(
    (_evt: unknown, viewport: Viewport) => {
      updateDiagramLayout(viewport.zoom, { x: viewport.x, y: viewport.y });
    },
    [updateDiagramLayout]
  );

  const handleAutoLayout = useCallback(() => {
    if (derivedNodes.length === 0) {
      message.info('暂无表可整理');
      return;
    }
    const positions = computeLayout(derivedNodes, edges);
    for (const [tableId, pos] of Object.entries(positions)) {
      updateTablePosition(tableId, pos);
    }
    // 让视图随新布局复位
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
    message.success('已按依赖关系整理布局');
  }, [derivedNodes, edges, updateTablePosition, fitView, message]);

  const toolbar = useMemo(
    () => (
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          background: '#fff',
          padding: 6,
          borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <Space size={4}>
          <Tooltip title="按外键依赖自动整理布局（dagre）">
            <Button size="small" icon={<ApartmentOutlined />} onClick={handleAutoLayout}>
              整理布局
            </Button>
          </Tooltip>
          <Tooltip title={fullscreen ? '退出全屏' : '全屏查看'}>
            <Button
              size="small"
              icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={onToggleFullscreen}
            />
          </Tooltip>
        </Space>
      </div>
    ),
    [fullscreen, handleAutoLayout, onToggleFullscreen]
  );

  if (!project) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="尚未加载项目" />
      </div>
    );
  }

  if (project.tables.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="项目中暂无数据表，请先在设计器中新建表" />
      </div>
    );
  }

  return (
    <>
      {toolbar}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => selectTable(node.id)}
        onPaneClick={() => selectTable(null)}
        onMoveEnd={onMoveEnd}
        fitView={!project.diagramLayout}
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#eee" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} maskColor="rgba(0,0,0,0.05)" />
      </ReactFlow>
    </>
  );
};

const DiagramView: React.FC = () => {
  const [fullscreen, setFullscreen] = useState(false);
  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#fff',
      }
    : { position: 'relative', height: '100%', width: '100%' };

  return (
    <div style={containerStyle}>
      <ReactFlowProvider>
        <Inner fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} />
      </ReactFlowProvider>
    </div>
  );
};

export default DiagramView;
