import React, { useEffect, useMemo } from 'react';
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from '@/components/layout/AppLayout';
import { useUiStore } from '@/store/uiStore';

const LIGHT_BODY_BG = '#ffffff';
const DARK_BODY_BG = '#1c1f23';

const App: React.FC = () => {
  const themeMode = useUiStore((s) => s.themeMode);
  const isDark = themeMode === 'dark';

  useEffect(() => {
    document.body.style.background = isDark ? DARK_BODY_BG : LIGHT_BODY_BG;
    document.body.dataset.theme = themeMode;
  }, [isDark, themeMode]);

  const themeConfig = useMemo<ThemeConfig>(() => {
    if (!isDark) {
      return {
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      };
    }
    // 柔化暗色：避开纯黑底 / 纯白入参的强对比，背景使用一组接近编辑器的中性灰
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorPrimary: '#4096ff',
        borderRadius: 6,
        colorBgBase: '#1c1f23',
        colorTextBase: '#d6d8db',
        colorBorder: '#3a3f45',
        colorBorderSecondary: '#2a2e33',
      },
      components: {
        Layout: {
          bodyBg: '#1c1f23',
          headerBg: '#23272d',
          siderBg: '#1a1d21',
        },
        Menu: {
          itemBg: 'transparent',
        },
        Table: {
          headerBg: '#23272d',
          rowHoverBg: '#23272d',
          colorBgContainer: '#1f2226',
          borderColor: '#2a2e33',
        },
        Input: {
          colorBgContainer: '#23272d',
        },
        Select: {
          colorBgContainer: '#23272d',
        },
        Button: {
          colorBgContainer: '#23272d',
        },
        Modal: {
          contentBg: '#23272d',
          headerBg: '#23272d',
        },
        Tooltip: {
          colorBgSpotlight: '#2f343a',
        },
      },
    };
  }, [isDark]);

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntApp>
        <AppLayout />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
