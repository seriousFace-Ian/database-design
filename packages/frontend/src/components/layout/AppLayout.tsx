import React from 'react';
import { Layout } from 'antd';
import Toolbar from './Toolbar';
import Sidebar from '@/components/sidebar/Sidebar';
import { useUiStore } from '@/store/uiStore';
import DesignerPage from '@/pages/DesignerPage';
import DiagramPage from '@/pages/DiagramPage';
import SqlPreviewModal from '@/components/sql/SqlPreviewModal';
import ExecuteDdlModal from '@/components/sql/ExecuteDdlModal';
import ConnectionPanel from '@/components/connection/ConnectionPanel';
import EnumEditor from '@/components/editor/EnumEditor';

const { Sider, Content } = Layout;

const AppLayout: React.FC = () => {
  const { activeView, sidebarCollapsed } = useUiStore();

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
          style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}
          trigger={null}
        >
          <Sidebar />
        </Sider>

        {/* 主内容区 */}
        <Content style={{ overflow: 'auto', background: '#fff' }}>
          {activeView === 'designer' ? <DesignerPage /> : <DiagramPage />}
        </Content>
      </Layout>

      {/* 全局弹窗 */}
      <SqlPreviewModal />
      <ExecuteDdlModal />
      <ConnectionPanel />
      <EnumEditor />
    </Layout>
  );
};

export default AppLayout;
