import { create } from 'zustand';
import type { DbConnectionConfig } from '@/types/api';

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

interface ConnectionState {
  config: DbConnectionConfig;
  status: ConnectionStatus;
  pgVersion: string | null;
  errorMessage: string | null;

  setConfig: (config: Partial<DbConnectionConfig>) => void;
  setStatus: (status: ConnectionStatus, meta?: { version?: string; error?: string }) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: DbConnectionConfig = {
  host: 'localhost',
  port: 5432,
  database: '',
  username: '',
  password: '',
  ssl: false,
};

export const useConnectionStore = create<ConnectionState>((set) => ({
  config: { ...DEFAULT_CONFIG },
  status: 'idle',
  pgVersion: null,
  errorMessage: null,

  setConfig: (partial) =>
    set((s) => ({ config: { ...s.config, ...partial } })),

  setStatus: (status, meta) =>
    set({
      status,
      pgVersion: meta?.version ?? null,
      errorMessage: meta?.error ?? null,
    }),

  reset: () =>
    set({ config: { ...DEFAULT_CONFIG }, status: 'idle', pgVersion: null, errorMessage: null }),
}));
