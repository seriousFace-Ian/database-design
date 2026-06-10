import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActiveView = 'designer' | 'diagram';
export type ThemeMode = 'light' | 'dark';

export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 520;
export const SIDEBAR_WIDTH_DEFAULT = 240;

interface UiState {
  activeView: ActiveView;
  selectedTableId: string | null;
  selectedFieldId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sqlPreviewOpen: boolean;
  connectionPanelOpen: boolean;
  enumManagerOpen: boolean;
  executeDdlOpen: boolean;
  sqlDiffOpen: boolean;
  themeMode: ThemeMode;

  setActiveView: (view: ActiveView) => void;
  selectTable: (tableId: string | null) => void;
  selectField: (fieldId: string | null) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setSqlPreviewOpen: (open: boolean) => void;
  setConnectionPanelOpen: (open: boolean) => void;
  setEnumManagerOpen: (open: boolean) => void;
  setExecuteDdlOpen: (open: boolean) => void;
  setSqlDiffOpen: (open: boolean) => void;
  toggleThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeView: 'designer',
      selectedTableId: null,
      selectedFieldId: null,
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      sqlPreviewOpen: false,
      connectionPanelOpen: false,
      enumManagerOpen: false,
      executeDdlOpen: false,
      sqlDiffOpen: false,
      themeMode: 'light',

      setActiveView: (view) => set({ activeView: view }),
      selectTable: (tableId) => set({ selectedTableId: tableId, selectedFieldId: null }),
      selectField: (fieldId) => set({ selectedFieldId: fieldId }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width))),
        }),
      setSqlPreviewOpen: (open) => set({ sqlPreviewOpen: open }),
      setConnectionPanelOpen: (open) => set({ connectionPanelOpen: open }),
      setEnumManagerOpen: (open) => set({ enumManagerOpen: open }),
      setExecuteDdlOpen: (open) => set({ executeDdlOpen: open }),
      setSqlDiffOpen: (open) => set({ sqlDiffOpen: open }),
      toggleThemeMode: () => set((s) => ({ themeMode: s.themeMode === 'light' ? 'dark' : 'light' })),
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    {
      name: 'dbdesign-ui',
      partialize: (s) => ({ themeMode: s.themeMode, sidebarWidth: s.sidebarWidth }),
    }
  )
);
