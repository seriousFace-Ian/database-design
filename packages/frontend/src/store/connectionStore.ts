import {create} from 'zustand'
import {createJSONStorage, persist} from 'zustand/middleware'

import type {DbConnectionConfig} from '@/types/api'

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error'

interface ConnectionState {
  config: DbConnectionConfig
  status: ConnectionStatus
  pgVersion: string | null
  errorMessage: string | null

  setConfig: (config: Partial<DbConnectionConfig>) => void
  setStatus: (status: ConnectionStatus, meta?: {version?: string; error?: string}) => void
  disconnect: () => void
  reset: () => void
}

const DEFAULT_CONFIG: DbConnectionConfig = {
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: '',
  ssl: false,
}

const cleared = () => ({
  config: {...DEFAULT_CONFIG},
  status: 'idle' as ConnectionStatus,
  pgVersion: null,
  errorMessage: null,
})

export const useConnectionStore = create<ConnectionState>()(
  persist(
    set => ({
      ...cleared(),

      setConfig: partial => set(s => ({config: {...s.config, ...partial}})),

      setStatus: (status, meta) =>
        set({
          status,
          pgVersion: meta?.version ?? null,
          errorMessage: meta?.error ?? null,
        }),

      disconnect: () => set(cleared()),
      reset: () => set(cleared()),
    }),
    {
      // sessionStorage：F5 刷新保留连接，关闭 tab 自动清除
      name: 'dbdesign-connection',
      storage: createJSONStorage(() => sessionStorage),
      // 仅持久化“已连接”态；testing/error 等瞬时态刷新后归零
      partialize: state => ({
        config: state.config,
        status:
          state.status === 'connected'
            ? ('connected' as ConnectionStatus)
            : ('idle' as ConnectionStatus),
        pgVersion: state.status === 'connected' ? state.pgVersion : null,
      }),
    }
  )
)
