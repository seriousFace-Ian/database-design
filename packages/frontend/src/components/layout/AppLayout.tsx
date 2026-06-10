import React, { useCallback, useEffect, useRef } from 'react';
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
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

const { Sider, Content } = Layout;

const SidebarResizer: React.FC = () => {
  const { sidebarWidth, setSidebarWidth } = useUiStore();
  const { token } = theme.useToken();
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [hover, setHover] = React.useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setSidebarWidth(startWidth.current + delta);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setSidebarWidth]);

  const handleDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    },
    [sidebarWidth],
  );

  return (
    <div
      onMouseDown={handleDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: hover || dragging.current ? token.colorPrimaryBorder : 'transparent',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      aria-label="拖动调整侧栏宽度"
    />
  );
};

const AppLayout: React.FC = () => {
  const { activeView, sidebarCollapsed, sidebarWidth } = useUiStore();
  const { token } = theme.useToken();
  useKeyboardShortcuts();
  useUnsavedGuard();

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <Toolbar />

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* 左侧表列表 */}
        <Sider
          width={sidebarWidth}
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

        {/* 拉伸宽度 */}
        {!sidebarCollapsed && <SidebarResizer />}

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
