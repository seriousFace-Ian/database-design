-- ============================================================================
-- Migration: 001_create_dbdesign
-- 目的: 在目标数据库中创建 DB Design 的内嵌配置表 __dbdesign
--       以单行 JSONB 保存完整的 ProjectFile（单库单份设计）
--
-- 说明:
--   * 本文件与后端 services/configStore.ts 的 CREATE_TABLE_SQL 保持一致，
--     两者均为幂等。后端在每次 save 前会自愈式建表，因此本迁移仅用于
--     手动初始化 / DBA 审阅 / CI 预置场景，并非运行时必需。
--   * 全部语句幂等，可重复执行。
--
-- 用法:
--   psql -d <database> -f 001_create_dbdesign.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 主配置表：单库单行，存完整 ProjectFile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS __dbdesign (
  id         INT         PRIMARY KEY DEFAULT 1,
  config     JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT __dbdesign_single_row CHECK (id = 1)   -- 强制全表至多一行
);

COMMENT ON TABLE  __dbdesign            IS 'DB Design 工具的内嵌设计配置表（单库单行）';
COMMENT ON COLUMN __dbdesign.id         IS '固定为 1，配合 CHECK 约束保证唯一行';
COMMENT ON COLUMN __dbdesign.config     IS '完整 ProjectFile 的 JSONB，结构等同 .dbdesign.json';
COMMENT ON COLUMN __dbdesign.updated_at IS '最后一次写入时间';

COMMIT;

-- ============================================================================
-- 可选：版本历史
-- ----------------------------------------------------------------------------
-- 如需在每次保存时自动留存快照，取消下方整段注释后执行。
-- 注意：触发器会让每次 save 追加一行历史，需自行定期清理（仅保留最近 N 条）。
-- ============================================================================
-- BEGIN;
--
-- CREATE TABLE IF NOT EXISTS __dbdesign_history (
--   id       BIGSERIAL   PRIMARY KEY,
--   config   JSONB       NOT NULL,
--   saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   note     TEXT
-- );
--
-- COMMENT ON TABLE __dbdesign_history IS 'DB Design 设计配置的历史快照';
--
-- -- 每次 INSERT/UPDATE 主表后，自动写入一条历史快照
-- CREATE OR REPLACE FUNCTION __dbdesign_snapshot() RETURNS trigger AS $$
-- BEGIN
--   INSERT INTO __dbdesign_history (config) VALUES (NEW.config);
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS __dbdesign_snapshot_trg ON __dbdesign;
-- CREATE TRIGGER __dbdesign_snapshot_trg
--   AFTER INSERT OR UPDATE ON __dbdesign
--   FOR EACH ROW EXECUTE FUNCTION __dbdesign_snapshot();
--
-- COMMIT;

-- ============================================================================
-- 回滚（如需移除）:
--   DROP TRIGGER  IF EXISTS __dbdesign_snapshot_trg ON __dbdesign;
--   DROP FUNCTION IF EXISTS __dbdesign_snapshot();
--   DROP TABLE    IF EXISTS __dbdesign_history;
--   DROP TABLE    IF EXISTS __dbdesign;
-- ============================================================================
