import React, { useState } from 'react';
import {
  Button,
  Space,
  Segmented,
  Tag,
  Tooltip,
  Typography,
  App,
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
  CloudUploadOutlined,
  CloudDownloadOutlined,
  DisconnectOutlined,
  ThunderboltOutlined,
  ImportOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useSaveProject, useLoadProject } from '@/hooks/useFileSystem';
import { saveProjectToDb, loadProjectFromDb } from '@/api/project';
import { inspectSchema } from '@/api/connection';
import { inspectionToProject } from '@/utils/schemaImporter';

const { Text } = Typography;

const Toolbar: React.FC = () => {
  const { message, modal } = App.useApp();
  const { project, isDirty, loadProject: loadProjectIntoStore, markSaved } = useProjectStore();
  const { activeView, setActiveView, setSqlPreviewOpen, setConnectionPanelOpen, setExecuteDdlOpen, setSqlDiffOpen } = useUiStore();
  const { config: dbConfig, status: dbStatus, disconnect } = useConnectionStore();
  // zundo temporal 暂时直接用 store 内置
  const temporalStore = useProjectStore.temporal;
  const canUndo = temporalStore.getState().pastStates.length > 0;
  const canRedo = temporalStore.getState().futureStates.length > 0;

  const saveProject = useSaveProject();
  const loadProject = useLoadProject();
  const { newProject } = useProjectStore();

  const [dbSaving, setDbSaving] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbImporting, setDbImporting] = useState(false);
  const dbConnected = dbStatus === 'connected';

  const handleNew = () => {
    newProject('新建项目');
  };

  const handleSaveToDb = async () => {
    if (!project) return;
    setDbSaving(true);
    try {
      const res = await saveProjectToDb(dbConfig, project);
      if (res.success) {
        markSaved();
        message.success(`已保存到数据库 ${dbConfig.database}`);
      }
    } finally {
      setDbSaving(false);
    }
  };

  const handleLoadFromDb = async () => {
    setDbLoading(true);
    try {
      const res = await loadProjectFromDb(dbConfig);
      if (res.found && res.project) {
        loadProjectIntoStore(res.project);
        message.success('已从数据库加载设计');
      } else {
        message.info(`数据库 ${dbConfig.database} 中暂无设计配置`);
      }
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportFromDb = () => {
    modal.confirm({
      title: '从数据库导入结构？',
      content: isDirty
        ? '将读取所连数据库的表/字段/外键/索引/ENUM 并覆盖当前设计。当前设计有未保存改动，建议先保存。确定继续？'
        : '将读取所连数据库的表/字段/外键/索引/ENUM，覆盖当前内存中的设计。',
      okText: '导入并覆盖',
      cancelText: '取消',
      onOk: async () => {
        setDbImporting(true);
        try {
          const res = await inspectSchema(dbConfig);
          if (res.success) {
            const imported = inspectionToProject(res.data, dbConfig.database || '导入的数据库');
            loadProjectIntoStore(imported);
            message.success(`已导入 ${res.data.tables.length} 张表、${res.data.enums.length} 个 ENUM`);
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : '导入失败');
        } finally {
          setDbImporting(false);
        }
      },
    });
  };

  const handleDisconnect = () => {
    modal.confirm({
      title: '断开连接并刷新？',
      content: isDirty
        ? '当前设计有未保存改动，刷新后将丢失。建议先「存库」或「保存」。确定继续？'
        : '将断开数据库连接并刷新页面，清空当前内存状态。',
      okText: '断开并刷新',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        disconnect();
        window.location.reload();
      },
    });
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
        <Tooltip title={dbConnected ? '将生成的 DDL 执行到所连数据库' : '请先在「连接」中测试通过'}>
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            onClick={() => setExecuteDdlOpen(true)}
            disabled={!project || !dbConnected}
          >
            执行
          </Button>
        </Tooltip>
        <Tooltip title={dbConnected ? '对比当前设计与数据库现状，生成 ALTER 语句' : '请先在「连接」中测试通过'}>
          <Button
            icon={<DiffOutlined />}
            size="small"
            onClick={() => setSqlDiffOpen(true)}
            disabled={!project || !dbConnected}
          >
            对比
          </Button>
        </Tooltip>
        <Button
          icon={<DatabaseOutlined />}
          size="small"
          onClick={() => setConnectionPanelOpen(true)}
        >
          连接
        </Button>
        {dbConnected && (
          <Tooltip title={`已连接：${dbConfig.username}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`}>
            <Tag color="success" style={{ marginRight: 0 }}>
              {dbConfig.database || '已连接'}
            </Tag>
          </Tooltip>
        )}
        <Tooltip title={dbConnected ? '将当前设计保存到所连数据库' : '请先在「连接」中测试通过'}>
          <Button
            icon={<CloudUploadOutlined />}
            size="small"
            loading={dbSaving}
            onClick={handleSaveToDb}
            disabled={!dbConnected || !project}
          >
            存库
          </Button>
        </Tooltip>
        <Tooltip title={dbConnected ? '从所连数据库读取已保存的设计' : '请先在「连接」中测试通过'}>
          <Button
            icon={<CloudDownloadOutlined />}
            size="small"
            loading={dbLoading}
            onClick={handleLoadFromDb}
            disabled={!dbConnected}
          >
            读库
          </Button>
        </Tooltip>
        <Tooltip title={dbConnected ? '逆向读取数据库现有结构为设计' : '请先在「连接」中测试通过'}>
          <Button
            icon={<ImportOutlined />}
            size="small"
            loading={dbImporting}
            onClick={handleImportFromDb}
            disabled={!dbConnected}
          >
            导入
          </Button>
        </Tooltip>
        {dbConnected && (
          <Tooltip title="断开连接并刷新全局">
            <Button
              icon={<DisconnectOutlined />}
              size="small"
              danger
              onClick={handleDisconnect}
            />
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default Toolbar;
