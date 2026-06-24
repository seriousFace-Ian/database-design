import {createPool} from './pgClient'
import {DbConnectionConfig} from '../types'

/**
 * 数据库内嵌配置存储
 * 在目标数据库中维护一张 __dbdesign 配置表，以单行 JSONB 保存整个 ProjectFile。
 * 单库单份设计（CHECK 强制只有一行），凭据沿用 per-request 连接、用完即释放。
 */

const CONFIG_TABLE = '__dbdesign'

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (
  id         INT PRIMARY KEY DEFAULT 1,
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ${CONFIG_TABLE}_single_row CHECK (id = 1)
);`

/**
 * 确保配置表存在（幂等）
 */
export async function initConfigTable(config: DbConnectionConfig): Promise<void> {
  const pool = createPool(config)
  try {
    await pool.query(CREATE_TABLE_SQL)
  } finally {
    await pool.end()
  }
}

/**
 * upsert 整个 ProjectFile，返回写入时间
 */
export async function saveProjectConfig(
  config: DbConnectionConfig,
  project: unknown
): Promise<string> {
  const pool = createPool(config)
  try {
    await pool.query(CREATE_TABLE_SQL) // 自愈：表不存在则先建
    const result = await pool.query<{updated_at: string}>(
      `INSERT INTO ${CONFIG_TABLE} (id, config, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE
         SET config = EXCLUDED.config, updated_at = now()
       RETURNING updated_at`,
      [JSON.stringify(project)]
    )
    return result.rows[0].updated_at
  } finally {
    await pool.end()
  }
}

/**
 * 读取 ProjectFile；表不存在或无数据返回 null
 */
export async function loadProjectConfig(
  config: DbConnectionConfig
): Promise<{project: unknown; updatedAt: string} | null> {
  const pool = createPool(config)
  try {
    const exists = await pool.query<{reg: string | null}>(`SELECT to_regclass($1) AS reg`, [
      CONFIG_TABLE,
    ])
    if (!exists.rows[0].reg) return null // 表不存在

    const result = await pool.query<{config: unknown; updated_at: string}>(
      `SELECT config, updated_at FROM ${CONFIG_TABLE} WHERE id = 1`
    )
    if (result.rows.length === 0) return null
    return {project: result.rows[0].config, updatedAt: result.rows[0].updated_at}
  } finally {
    await pool.end()
  }
}
