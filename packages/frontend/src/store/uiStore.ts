import { create } from 'zustand';

export type ActiveView = 'designer' | 'diagram';

interface UiState {
  activeView: ActiveView;
  selectedTableId: string | null;
  selectedFieldId: string | null;
  sidebarCollapsed: boolean;
  sqlPreviewOpen: boolean;
  connectionPanelOpen: boolean;
  enumManagerOpen: boolean;

  setActiveView: (view: ActiveView) => void;
  selectTable: (tableId: string | null) => void;
  selectField: (fieldId: string | null) => void;
  toggleSidebar: () => void;
  setSqlPreviewOpen: (open: boolean) => void;
  setConnectionPanelOpen: (open: boolean) => void;
  setEnumManagerOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'designer',
  selectedTableId: null,
  selectedFieldId: null,
  sidebarCollapsed: false,
  sqlPreviewOpen: false,
  connectionPanelOpen: false,
  enumManagerOpen: false,

  setActiveView: (view) => set({ activeView: view }),
  selectTable: (tableId) => set({ selectedTableId: tableId, selectedFieldId: null }),
  selectField: (fieldId) => set({ selectedFieldId: fieldId }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSqlPreviewOpen: (open) => set({ sqlPreviewOpen: open }),
  setConnectionPanelOpen: (open) => set({ connectionPanelOpen: open }),
  setEnumManagerOpen: (open) => set({ enumManagerOpen: open }),
}));
