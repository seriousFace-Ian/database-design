import React from 'react';
import {
  Button,
  Space,
  Segmented,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  SaveOutlined,
  FolderOpenOutlined,
  CodeOutlined,
  ApartmentOutlined,
  EditOutlined,
  DatabaseOutlined,
  PlusOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useSaveProject, useLoadProject } from '@/hooks/useFileSystem';

const { Text } = Typography;

const Toolbar: React.FC = () => {
  const { project, isDirty } = useProjectStore();
  const { activeView, setActiveView, setSqlPreviewOpen, setConnectionPanelOpen } = useUiStore();
  // zundo temporal 暂时直接用 store 内置
  const temporalStore = useProjectStore.temporal;
  const canUndo = temporalStore.getState().pastStates.length > 0;
  const canRedo = temporalStore.getState().futureStates.length > 0;

  const saveProject = useSaveProject();
  const loadProject = useLoadProject();
  const { newProject } = useProjectStore();

  const handleNew = () => {
    newProject('新建项目');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 52,
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        flexShrink: 0,
      }}
    >
      {/* 左：项目名 */}
      <Space size={8}>
        <DatabaseOutlined style={{ fontSize: 18, color: '#1677ff' }} />
        <Text strong style={{ fontSize: 15 }}>
          {project?.name ?? 'DB Design'}
        </Text>
        {isDirty && (
          <Tag color="orange" style={{ marginLeft: 4 }}>
            未保存
          </Tag>
        )}
      </Space>

      {/* 中：视图切换 */}
      <Segmented
        value={activeView}
        onChange={(v) => setActiveView(v as 'designer' | 'diagram')}
        options={[
          { label: <Space><EditOutlined />设计器</Space>, value: 'designer' },
          { label: <Space><ApartmentOutlined />关系图</Space>, value: 'diagram' },
        ]}
      />

      {/* 右：操作按钮 */}
      <Space size={4}>
        <Tooltip title="撤销">
          <Button
            icon={<UndoOutlined />}
            size="small"
            disabled={!canUndo}
            onClick={() => temporalStore.getState().undo()}
          />
        </Tooltip>
        <Tooltip title="重做">
          <Button
            icon={<RedoOutlined />}
            size="small"
            disabled={!canRedo}
            onClick={() => temporalStore.getState().redo()}
          />
        </Tooltip>
        <Button icon={<PlusOutlined />} size="small" onClick={handleNew}>
          新建
        </Button>
        <Button icon={<FolderOpenOutlined />} size="small" onClick={loadProject}>
          打开
        </Button>
        <Button
          icon={<SaveOutlined />}
          size="small"
          type={isDirty ? 'primary' : 'default'}
          onClick={saveProject}
          disabled={!project}
        >
          保存
        </Button>
        <Button
          icon={<CodeOutlined />}
          size="small"
          onClick={() => setSqlPreviewOpen(true)}
          disabled={!project}
        >
          SQL
        </Button>
        <Button
          icon={<DatabaseOutlined />}
          size="small"
          onClick={() => setConnectionPanelOpen(true)}
        >
          连接
        </Button>
      </Space>
    </div>
  );
};

export default Toolbar;
