import {useEffect} from 'react'

import {App} from 'antd'

import {useProjectStore} from '@/store/projectStore'
import {useUiStore} from '@/store/uiStore'

import {useSaveProject} from './useFileSystem'

/** 焦点在输入控件内时，全局快捷键让位给行内编辑 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  // AntD Select 的搜索框使用 role=combobox
  if (target.getAttribute('role') === 'combobox') return true
  return false
}

/**
 * 注册全局键盘快捷键：
 * - Ctrl/Cmd+S       保存项目
 * - Ctrl/Cmd+Z       撤销
 * - Ctrl/Cmd+Shift+Z 重做（Ctrl+Y 同义）
 * - Delete/Backspace 删除当前选中表（在设计器视图、未编辑时）
 *
 * Escape 关闭 Modal 由 AntD 自带处理；行内编辑里的 Esc/Enter 由具体组件接管。
 */
export function useKeyboardShortcuts(): void {
  const {modal} = App.useApp()
  const save = useSaveProject()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // ---------- Ctrl/Cmd + S ----------
      if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        save()
        return
      }

      // ---------- Undo / Redo ----------
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        // 文本框内的 Ctrl+Z 让浏览器原生撤销接管
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        const temporal = useProjectStore.temporal.getState()
        if (e.shiftKey) {
          if (temporal.futureStates.length > 0) temporal.redo()
        } else {
          if (temporal.pastStates.length > 0) temporal.undo()
        }
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        const temporal = useProjectStore.temporal.getState()
        if (temporal.futureStates.length > 0) temporal.redo()
        return
      }

      // ---------- Delete 选中表 ----------
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.shiftKey) {
        if (isEditableTarget(e.target)) return
        const ui = useUiStore.getState()
        const proj = useProjectStore.getState()
        const tableId = ui.selectedTableId
        if (!tableId || !proj.project) return
        const table = proj.project.tables.find(t => t.id === tableId)
        if (!table) return
        e.preventDefault()
        modal.confirm({
          title: `删除表「${table.schema}.${table.name}」？`,
          content: '将同时清理其他表中指向此表的外键引用。可用 Ctrl+Z 撤销。',
          okText: '删除',
          okButtonProps: {danger: true},
          cancelText: '取消',
          onOk: () => {
            proj.deleteTable(tableId)
            ui.selectTable(null)
          },
        })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modal, save])
}
