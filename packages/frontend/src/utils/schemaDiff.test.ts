import { describe, it, expect } from 'vitest';
import {
  computeSchemaDiff,
  renderDiffSql,
  flattenDiffSql,
  isEmptyDiff,
  countDiffChanges,
} from './schemaDiff';
import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
} from '@/types/schema';

let fieldCounter = 0;
function field(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  fieldCounter += 1;
  return {
    id: overrides.id ?? `f${fieldCounter}`,
    name: 'col',
    type: 'INTEGER',
    nullable: true,
    isPrimaryKey: false,
    isUnique: false,
    order: 0,
    ...overrides,
  };
}

let tableCounter = 0;
function table(overrides: Partial<TableDefinition> = {}): TableDefinition {
  tableCounter += 1;
  return {
    id: overrides.id ?? `t${tableCounter}`,
    name: 'tbl',
    schema: 'public',
    fields: [],
    indexes: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function project(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    $schema: 'x',
    version: '1.0',
    name: 'proj',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    enums: [],
    tables: [],
    ...overrides,
  };
}

describe('schemaDiff', () => {
  it('reports no diff when schemas are identical', () => {
    const t = table({
      id: 't1',
      name: 'users',
      fields: [field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false })],
    });
    const cur = project({ tables: [t] });
    const tgt = project({ tables: [t] });
    const diff = computeSchemaDiff(cur, tgt);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(flattenDiffSql(renderDiffSql(diff, []))).toEqual([]);
  });

  it('detects new table', () => {
    const newTable = table({
      id: 't1', name: 'users', schema: 'public',
      fields: [
        field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fb', name: 'email', type: 'VARCHAR', length: 200, nullable: false, isUnique: true }),
      ],
    });
    const diff = computeSchemaDiff(project(), project({ tables: [newTable] }));
    expect(diff.tables.added).toHaveLength(1);
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql[0]).toContain('CREATE TABLE "public"."users"');
    expect(sql[0]).toContain('"email" VARCHAR(200) NOT NULL UNIQUE');
    expect(sql[0]).toContain('PRIMARY KEY ("id")');
  });

  it('detects dropped table', () => {
    const t = table({ id: 't1', name: 'orders' });
    const diff = computeSchemaDiff(project({ tables: [t] }), project());
    expect(diff.tables.dropped).toEqual([{ schema: 'public', name: 'orders' }]);
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toEqual(['DROP TABLE "public"."orders" CASCADE;']);
  });

  it('detects added and dropped columns', () => {
    const before = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fb', name: 'old_col', type: 'TEXT' }),
      ],
    });
    const after = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fc', name: 'new_col', type: 'VARCHAR', length: 100, nullable: false }),
      ],
    });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const mod = diff.tables.modified[0];
    expect(mod.columnsAdded.map(c => c.name)).toEqual(['new_col']);
    expect(mod.columnsDropped).toEqual(['old_col']);
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain('ALTER TABLE "public"."users" DROP COLUMN "old_col";');
    expect(sql).toContain('ALTER TABLE "public"."users" ADD COLUMN "new_col" VARCHAR(100) NOT NULL;');
  });

  it('detects column type/nullable/default changes', () => {
    const before = table({
      id: 't1', name: 'users',
      fields: [field({ id: 'fa', name: 'age', type: 'INTEGER', nullable: true })],
    });
    const after = table({
      id: 't1', name: 'users',
      fields: [field({ id: 'fa', name: 'age', type: 'BIGINT', nullable: false, defaultValue: '0' })],
    });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const mod = diff.tables.modified[0];
    expect(mod.columnsModified[0].field).toBe('age');
    expect(mod.columnsModified[0].changes.type).toEqual({ from: 'INTEGER', to: 'BIGINT' });
    expect(mod.columnsModified[0].changes.nullable).toEqual({ from: true, to: false });
    expect(mod.columnsModified[0].changes.default).toEqual({ from: null, to: '0' });
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain(
      'ALTER TABLE "public"."users" ALTER COLUMN "age" TYPE BIGINT USING "age"::BIGINT;'
    );
    expect(sql).toContain('ALTER TABLE "public"."users" ALTER COLUMN "age" SET NOT NULL;');
    expect(sql).toContain('ALTER TABLE "public"."users" ALTER COLUMN "age" SET DEFAULT 0;');
  });

  it('detects added foreign key with constraint name', () => {
    const users = table({
      id: 'u', name: 'users',
      fields: [field({ id: 'uid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false })],
    });
    const ordersBefore = table({
      id: 'o', name: 'orders',
      fields: [
        field({ id: 'oid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'ouser', name: 'user_id', type: 'BIGINT' }),
      ],
    });
    const ordersAfter = table({
      ...ordersBefore,
      fields: [
        field({ id: 'oid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({
          id: 'ouser',
          name: 'user_id',
          type: 'BIGINT',
          foreignKey: {
            referenceTableId: 'u',
            referenceFieldId: 'uid',
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
            constraintName: 'fk_orders_user',
          },
        }),
      ],
    });
    const diff = computeSchemaDiff(
      project({ tables: [users, ordersBefore] }),
      project({ tables: [users, ordersAfter] })
    );
    const mod = diff.tables.modified.find(m => m.name === 'orders')!;
    expect(mod.fksAdded[0].constraintName).toBe('fk_orders_user');
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain(
      'ALTER TABLE "public"."orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;'
    );
  });

  it('detects dropped foreign key', () => {
    const users = table({
      id: 'u', name: 'users',
      fields: [field({ id: 'uid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false })],
    });
    const ordersBefore = table({
      id: 'o', name: 'orders',
      fields: [
        field({ id: 'oid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({
          id: 'ouser',
          name: 'user_id',
          type: 'BIGINT',
          foreignKey: {
            referenceTableId: 'u',
            referenceFieldId: 'uid',
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
            constraintName: 'fk_orders_user',
          },
        }),
      ],
    });
    const ordersAfter = table({
      ...ordersBefore,
      fields: [
        field({ id: 'oid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'ouser', name: 'user_id', type: 'BIGINT' }),
      ],
    });
    const diff = computeSchemaDiff(
      project({ tables: [users, ordersBefore] }),
      project({ tables: [users, ordersAfter] })
    );
    const mod = diff.tables.modified.find(m => m.name === 'orders')!;
    expect(mod.fksDropped[0].constraintName).toBe('fk_orders_user');
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain('ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "fk_orders_user";');
  });

  it('detects new ENUM and added ENUM value', () => {
    const enumBefore: EnumType = { id: 'e1', schema: 'public', name: 'order_status', values: ['pending', 'paid'] };
    const enumAfter: EnumType = { id: 'e1', schema: 'public', name: 'order_status', values: ['pending', 'paid', 'shipped'] };
    const newEnum: EnumType = { id: 'e2', schema: 'public', name: 'role', values: ['admin', 'user'] };

    const diff = computeSchemaDiff(
      project({ enums: [enumBefore] }),
      project({ enums: [enumAfter, newEnum] })
    );
    expect(diff.enums.added.map(e => e.name)).toEqual(['role']);
    expect(diff.enums.valuesAdded).toEqual([
      { schema: 'public', name: 'order_status', values: ['shipped'] },
    ]);
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain('CREATE TYPE "public"."role" AS ENUM (\'admin\', \'user\');');
    expect(sql).toContain(
      'ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS \'shipped\';'
    );
  });

  it('detects dropped ENUM', () => {
    const e: EnumType = { id: 'e1', schema: 'public', name: 'role', values: ['admin'] };
    const diff = computeSchemaDiff(project({ enums: [e] }), project({ enums: [] }));
    expect(diff.enums.dropped).toEqual([{ schema: 'public', name: 'role' }]);
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain('DROP TYPE "public"."role";');
  });

  it('detects table comment change', () => {
    const before = table({ id: 't1', name: 'users', comment: '旧注释' });
    const after = table({ id: 't1', name: 'users', comment: '新注释' });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    expect(diff.tables.modified[0].commentChanged).toEqual({ from: '旧注释', to: '新注释' });
    const sql = flattenDiffSql(renderDiffSql(diff, []));
    expect(sql).toContain(`COMMENT ON TABLE "public"."users" IS '新注释';`);
  });

  it('new table referencing an existing table emits cross-table FK', () => {
    const users = table({
      id: 'u', name: 'users',
      fields: [field({ id: 'uid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false })],
    });
    const orders = table({
      id: 'o', name: 'orders',
      fields: [
        field({ id: 'oid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({
          id: 'ouser', name: 'user_id', type: 'BIGINT', nullable: false,
          foreignKey: {
            referenceTableId: 'u',
            referenceFieldId: 'uid',
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
            constraintName: 'fk_orders_user',
          },
        }),
      ],
    });
    const current = project({ tables: [users] });
    const target = project({ tables: [users, orders] });
    const diff = computeSchemaDiff(current, target);
    expect(diff.tables.added.map(t => t.name)).toEqual(['orders']);

    const sections = renderDiffSql(diff, target.enums, target.tables);
    const sql = flattenDiffSql(sections);
    // CREATE TABLE 不应内联 FK 子句
    expect(sql[0]).toContain('CREATE TABLE "public"."orders"');
    expect(sql[0]).not.toContain('FOREIGN KEY');
    // 紧随其后必须有跨表 ADD CONSTRAINT
    expect(sql).toContain(
      'ALTER TABLE "public"."orders" ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;'
    );
  });

  it('new table referencing another new table emits FK after both creates', () => {
    const users = table({
      id: 'u', name: 'users',
      fields: [field({ id: 'uid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false })],
    });
    const profiles = table({
      id: 'p', name: 'profiles',
      fields: [
        field({ id: 'pid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({
          id: 'puser', name: 'user_id', type: 'BIGINT', nullable: false,
          foreignKey: {
            referenceTableId: 'u',
            referenceFieldId: 'uid',
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
            constraintName: 'fk_profiles_user',
          },
        }),
      ],
    });
    const current = project({ tables: [] });
    const target = project({ tables: [users, profiles] });
    const diff = computeSchemaDiff(current, target);
    const sections = renderDiffSql(diff, target.enums, target.tables);
    const sql = flattenDiffSql(sections);
    const usersIdx = sql.findIndex(s => s.startsWith('CREATE TABLE "public"."users"'));
    const profilesIdx = sql.findIndex(s => s.startsWith('CREATE TABLE "public"."profiles"'));
    const fkIdx = sql.findIndex(s => s.includes('"fk_profiles_user"'));
    expect(usersIdx).toBeGreaterThanOrEqual(0);
    expect(profilesIdx).toBeGreaterThanOrEqual(0);
    expect(fkIdx).toBeGreaterThan(usersIdx);
    expect(fkIdx).toBeGreaterThan(profilesIdx);
  });

  it('drops ENUM after the column that still references it is altered to TEXT', () => {
    const enumDef: EnumType = { id: 'e1', schema: 'public', name: 'role_enum', values: ['admin', 'user'] };
    const before = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fr', name: 'role', type: 'USER-DEFINED', enumTypeId: 'e1', nullable: false }),
      ],
    });
    const after = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fr', name: 'role', type: 'TEXT', nullable: false }),
      ],
    });
    const diff = computeSchemaDiff(
      project({ enums: [enumDef], tables: [before] }),
      project({ enums: [], tables: [after] })
    );
    expect(diff.enums.dropped).toEqual([{ schema: 'public', name: 'role_enum' }]);
    expect(diff.tables.modified[0].columnsModified[0].changes.type).toEqual({
      from: '"public"."role_enum"',
      to: 'TEXT',
    });
    const sql = flattenDiffSql(renderDiffSql(diff, [], []));
    const alterIdx = sql.findIndex(s => s.includes('ALTER COLUMN "role" TYPE TEXT'));
    const dropTypeIdx = sql.findIndex(s => s === 'DROP TYPE "public"."role_enum";');
    expect(alterIdx).toBeGreaterThanOrEqual(0);
    expect(dropTypeIdx).toBeGreaterThanOrEqual(0);
    expect(dropTypeIdx).toBeGreaterThan(alterIdx);
  });

  it('detects added table-level UNIQUE constraint', () => {
    const fa = field({ id: 'fa', name: 'team_id', type: 'BIGINT', nullable: false });
    const fb = field({ id: 'fb', name: 'user_id', type: 'BIGINT', nullable: false });
    const before = table({ id: 't1', name: 'memberships', fields: [fa, fb], constraints: [] });
    const after = table({
      id: 't1', name: 'memberships', fields: [fa, fb],
      constraints: [{ id: 'c1', name: 'uq_team_user', kind: 'UNIQUE', fieldIds: ['fa', 'fb'] }],
    });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const mod = diff.tables.modified[0];
    expect(mod.tableConstraintsAdded).toHaveLength(1);
    expect(mod.tableConstraintsAdded[0].resolvedName).toBe('uq_team_user');
    const sql = flattenDiffSql(renderDiffSql(diff, [], [after]));
    expect(sql).toContain(
      'ALTER TABLE "public"."memberships" ADD CONSTRAINT "uq_team_user" UNIQUE ("team_id", "user_id");'
    );
  });

  it('detects dropped table-level CHECK constraint', () => {
    const fa = field({ id: 'fa', name: 'start_date', type: 'DATE' });
    const fb = field({ id: 'fb', name: 'end_date', type: 'DATE' });
    const before = table({
      id: 't1', name: 'events', fields: [fa, fb],
      constraints: [{ id: 'c1', name: 'chk_dates', kind: 'CHECK', expression: 'start_date < end_date' }],
    });
    const after = table({ id: 't1', name: 'events', fields: [fa, fb], constraints: [] });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const mod = diff.tables.modified[0];
    expect(mod.tableConstraintsDropped).toEqual([{ name: 'chk_dates' }]);
    const sql = flattenDiffSql(renderDiffSql(diff, [], [after]));
    expect(sql).toContain(
      'ALTER TABLE "public"."events" DROP CONSTRAINT IF EXISTS "chk_dates";'
    );
  });

  it('same constraint name with changed definition → drop + add', () => {
    const fa = field({ id: 'fa', name: 'a', type: 'INTEGER' });
    const fb = field({ id: 'fb', name: 'b', type: 'INTEGER' });
    const before = table({
      id: 't1', name: 't', fields: [fa, fb],
      constraints: [{ id: 'c1', name: 'chk_rule', kind: 'CHECK', expression: 'a < b' }],
    });
    const after = table({
      id: 't1', name: 't', fields: [fa, fb],
      constraints: [{ id: 'c1', name: 'chk_rule', kind: 'CHECK', expression: 'a <= b' }],
    });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const mod = diff.tables.modified[0];
    expect(mod.tableConstraintsDropped).toEqual([{ name: 'chk_rule' }]);
    expect(mod.tableConstraintsAdded[0].resolvedName).toBe('chk_rule');
    const sql = flattenDiffSql(renderDiffSql(diff, [], [after]));
    const dropIdx = sql.findIndex(s => s.includes('DROP CONSTRAINT IF EXISTS "chk_rule"'));
    const addIdx = sql.findIndex(s => s.includes('ADD CONSTRAINT "chk_rule" CHECK (a <= b)'));
    expect(dropIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThan(dropIdx);
  });

  it('new table with table-level constraint inlines it into CREATE TABLE (no separate ALTER)', () => {
    const fa = field({ id: 'fa', name: 'a', type: 'INTEGER' });
    const fb = field({ id: 'fb', name: 'b', type: 'INTEGER' });
    const newTable = table({
      id: 't1', name: 't', fields: [fa, fb],
      constraints: [{ id: 'c1', name: 'uq_ab', kind: 'UNIQUE', fieldIds: ['fa', 'fb'] }],
    });
    const diff = computeSchemaDiff(project(), project({ tables: [newTable] }));
    const sql = flattenDiffSql(renderDiffSql(diff, [], [newTable]));
    // 应该内联在 CREATE TABLE 内
    expect(sql[0]).toContain('CREATE TABLE "public"."t"');
    expect(sql[0]).toContain('CONSTRAINT "uq_ab" UNIQUE ("a", "b")');
    // 不应再出现独立 ALTER ADD CONSTRAINT
    expect(sql.filter(s => s.includes('ADD CONSTRAINT "uq_ab"'))).toHaveLength(0);
  });

  it('countDiffChanges aggregates additions/drops/modifications', () => {
    const before = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fb', name: 'gone', type: 'TEXT' }),
      ],
    });
    const after = table({
      id: 't1', name: 'users',
      fields: [
        field({ id: 'fa', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false }),
        field({ id: 'fc', name: 'created', type: 'TIMESTAMPTZ', nullable: false }),
      ],
    });
    const diff = computeSchemaDiff(project({ tables: [before] }), project({ tables: [after] }));
    const stats = countDiffChanges(diff);
    expect(stats.added).toBe(1);
    expect(stats.dropped).toBe(1);
  });
});
