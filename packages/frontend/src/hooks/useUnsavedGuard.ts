import {useEffect} from 'react'

import {useProjectStore} from '@/store/projectStore'

/**
 * 在 ProjectFile 处于「未保存」状态时，拦截浏览器层面的关闭 / 刷新 / 跳转。
 * 浏览器会弹出原生确认框，文案由浏览器决定（无法自定义）。
 * 应用内的「新建 / 打开 / 读库 / 断开」由调用点自己用 modal.confirm 防护。
 */
export function useUnsavedGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      // 实时读最新 isDirty，避免闭包陷阱
      if (useProjectStore.getState().isDirty) {
        e.preventDefault()
        // Chrome 仍需 returnValue 才弹出
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
}
