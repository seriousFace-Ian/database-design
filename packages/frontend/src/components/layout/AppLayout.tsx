import React from 'react';
import { Layout, theme } from 'antd';
import Toolbar from './Toolbar';
import Sidebar from '@/components/sidebar/Sidebar';
import { useUiStore } from '@/store/uiStore';
import DesignerPage from '@/pages/DesignerPage';
import DiagramPage from '@/pages/DiagramPage';
import SqlPreviewModal from '@/components/sql/SqlPreviewModal';
import ExecuteDdlModal from '@/components/sql/ExecuteDdlModal';
import SqlDiffModal from '@/components/sql/SqlDiffModal';
import ConnectionPanel from '@/components/connection/ConnectionPanel';
import EnumEditor from '@/components/editor/EnumEditor';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const { Sider, Content } = Layout;

const AppLayout: React.FC = () => {
  const { activeView, sidebarCollapsed } = useUiStore();
  const { token } = theme.useToken();
  useKeyboardShortcuts();

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <Toolbar />

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* 左侧表列表 */}
        <Sider
          width={240}
          collapsedWidth={0}
          collapsed={sidebarCollapsed}
          style={{
            background: token.colorBgLayout,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
            overflow: 'auto',
          }}
          trigger={null}
        >
          <Sidebar />
        </Sider>

        {/* 主内容区 */}
        <Content style={{ overflow: 'auto', background: token.colorBgContainer }}>
          {activeView === 'designer' ? <DesignerPage /> : <DiagramPage />}
        </Content>
      </Layout>

      {/* 全局弹窗 */}
      <SqlPreviewModal />
      <ExecuteDdlModal />
      <SqlDiffModal />
      <ConnectionPanel />
      <EnumEditor />
    </Layout>
  );
};

export default AppLayout;
