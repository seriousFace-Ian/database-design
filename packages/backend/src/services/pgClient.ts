import { Pool, PoolConfig } from 'pg';
import { DbConnectionConfig } from '../types';

/**
 * 根据连接配置创建临时 pg Pool
 * 注意：不持久化任何连接信息，每次请求创建独立连接
 */
export function createPool(config: DbConnectionConfig): Pool {
  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  };
  return new Pool(poolConfig);
}

/**
 * 测试数据库连接，返回 PostgreSQL 版本
 */
export async function testConnection(config: DbConnectionConfig): Promise<string> {
  const pool = createPool(config);
  try {
    const result = await pool.query<{ version: string }>('SELECT version()');
    return result.rows[0].version;
  } finally {
    await pool.end();
  }
}

/**
 * 在事务中执行多条 DDL 语句
 */
export async function executeInTransaction(
  config: DbConnectionConfig,
  statements: string[]
): Promise<{ executedCount: number; errors: Array<{ statement: string; error: string }> }> {
  const pool = createPool(config);
  const client = await pool.connect();
  const errors: Array<{ statement: string; error: string }> = [];
  let executedCount = 0;

  try {
    await client.query('BEGIN');
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        executedCount++;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push({ statement: stmt, error });
        throw err; // 触发回滚
      }
    }
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  return { executedCount, errors };
}

/**
 * 逐条执行 DDL 语句（非事务），记录每条结果
 */
export async function executeStatements(
  config: DbConnectionConfig,
  statements: string[]
): Promise<{ executedCount: number; errors: Array<{ statement: string; error: string }> }> {
  const pool = createPool(config);
  const errors: Array<{ statement: string; error: string }> = [];
  let executedCount = 0;

  try {
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
        executedCount++;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push({ statement: stmt, error });
      }
    }
  } finally {
    await pool.end();
  }

  return { executedCount, errors };
}
