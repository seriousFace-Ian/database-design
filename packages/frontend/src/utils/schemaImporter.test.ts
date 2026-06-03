import { describe, it, expect } from 'vitest';
import { inspectionToProject } from './schemaImporter';
import type { InspectSchemaResponse } from '@/types/api';

type InspectData = InspectSchemaResponse['data'];

function col(overrides: Partial<InspectData['tables'][0]['columns'][0]> = {}) {
  return {
    name: 'c',
    type: 'integer',
    nullable: true,
    defaultValue: null,
    isPrimaryKey: false,
    isUnique: false,
    comment: null,
    ordinalPosition: 1,
    ...overrides,
  };
}

describe('schemaImporter', () => {
  it('映射常见类型、长度、精度、数组', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 't',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'title', type: 'character varying(200)', ordinalPosition: 1 }),
            col({ name: 'price', type: 'numeric(10,2)', ordinalPosition: 2 }),
            col({ name: 'flag', type: 'boolean', ordinalPosition: 3 }),
            col({ name: 'tags', type: '_text[]', ordinalPosition: 4 }),
            col({ name: 'ts', type: 'timestamp with time zone', ordinalPosition: 5 }),
          ],
          foreignKeys: [],
          indexes: [],
        },
      ],
    };
    const p = inspectionToProject(data, 'imported');
    const f = p.tables[0].fields;
    expect(f[0]).toMatchObject({ type: 'VARCHAR', length: 200 });
    expect(f[1]).toMatchObject({ type: 'NUMERIC', precision: 10, scale: 2 });
    expect(f[2]).toMatchObject({ type: 'BOOLEAN' });
    expect(f[3]).toMatchObject({ type: 'TEXT', isArray: true });
    expect(f[4]).toMatchObject({ type: 'TIMESTAMPTZ' });
  });

  it('nextval 默认值识别为 SERIAL 并清除默认值', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 't',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'id', type: 'integer', isPrimaryKey: true, nullable: false, defaultValue: "nextval('t_id_seq'::regclass)" }),
            col({ name: 'big', type: 'bigint', defaultValue: "nextval('s'::regclass)" }),
          ],
          foreignKeys: [],
          indexes: [],
        },
      ],
    };
    const f = inspectionToProject(data, 'x').tables[0].fields;
    expect(f[0]).toMatchObject({ type: 'SERIAL' });
    expect(f[0].defaultValue).toBeUndefined();
    expect(f[1]).toMatchObject({ type: 'BIGSERIAL' });
  });

  it('USER-DEFINED 列关联到对应 ENUM', () => {
    const data: InspectData = {
      enums: [{ name: 'order_status', schema: 'public', values: ['a', 'b'] }],
      tables: [
        {
          name: 'orders',
          schema: 'public',
          comment: null,
          columns: [col({ name: 'status', type: 'order_status' })],
          foreignKeys: [],
          indexes: [],
        },
      ],
    };
    const p = inspectionToProject(data, 'x');
    const enumId = p.enums[0].id;
    expect(p.tables[0].fields[0]).toMatchObject({ type: 'USER-DEFINED', enumTypeId: enumId });
  });

  it('外键按名称解析回 id', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 'users',
          schema: 'public',
          comment: null,
          columns: [col({ name: 'id', type: 'integer', isPrimaryKey: true, nullable: false })],
          foreignKeys: [],
          indexes: [],
        },
        {
          name: 'posts',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'id', type: 'integer', isPrimaryKey: true, nullable: false, ordinalPosition: 1 }),
            col({ name: 'author_id', type: 'integer', ordinalPosition: 2 }),
          ],
          foreignKeys: [
            {
              constraintName: 'fk_posts_author',
              columnName: 'author_id',
              referenceTable: 'users',
              referenceSchema: 'public',
              referenceColumn: 'id',
              onDelete: 'CASCADE',
              onUpdate: 'NO ACTION',
            },
          ],
          indexes: [],
        },
      ],
    };
    const p = inspectionToProject(data, 'x');
    const usersId = p.tables[0].id;
    const usersIdField = p.tables[0].fields[0].id;
    const authorField = p.tables[1].fields.find(f => f.name === 'author_id')!;
    expect(authorField.foreignKey).toMatchObject({
      referenceTableId: usersId,
      referenceFieldId: usersIdField,
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      constraintName: 'fk_posts_author',
    });
  });

  it('跳过与单列 UNIQUE 约束重复的唯一索引，保留复合索引', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 't',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'email', type: 'text', isUnique: true, ordinalPosition: 1 }),
            col({ name: 'a', type: 'integer', ordinalPosition: 2 }),
            col({ name: 'b', type: 'integer', ordinalPosition: 3 }),
          ],
          foreignKeys: [],
          indexes: [
            { name: 'uq_email', columns: ['email'], isUnique: true, indexType: 'btree' },
            { name: 'idx_a_b', columns: ['a', 'b'], isUnique: false, indexType: 'btree' },
          ],
        },
      ],
    };
    const idx = inspectionToProject(data, 'x').tables[0].indexes;
    expect(idx).toHaveLength(1);
    expect(idx[0]).toMatchObject({ name: 'idx_a_b', isUnique: false, indexType: 'BTREE' });
  });

  it('复合 UNIQUE 不让字段变成单列唯一，仅保留复合唯一索引', () => {
    // 模拟修正后的 inspector 输出：复合 UNIQUE (a, b) 下字段 isUnique=false，
    // 其后备唯一索引以复合形式出现。
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 't',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'a', type: 'integer', isUnique: false, ordinalPosition: 1 }),
            col({ name: 'b', type: 'integer', isUnique: false, ordinalPosition: 2 }),
          ],
          foreignKeys: [],
          indexes: [
            { name: 'uq_a_b', columns: ['a', 'b'], isUnique: true, indexType: 'btree' },
          ],
        },
      ],
    };
    const t = inspectionToProject(data, 'x').tables[0];
    // 字段不应被标为单列唯一
    expect(t.fields.find(f => f.name === 'a')!.isUnique).toBe(false);
    expect(t.fields.find(f => f.name === 'b')!.isUnique).toBe(false);
    // 复合唯一以索引形式保留（不与任何单列 UNIQUE 重复，故不被去重跳过）
    expect(t.indexes).toHaveLength(1);
    expect(t.indexes[0]).toMatchObject({ name: 'uq_a_b', isUnique: true, fieldIds: expect.any(Array) });
    expect(t.indexes[0].fieldIds).toHaveLength(2);
  });

  it('表级 UNIQUE / CHECK 约束被映射到 TableConstraint[]', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 'events',
          schema: 'public',
          comment: null,
          columns: [
            col({ name: 'start_date', type: 'date', ordinalPosition: 1 }),
            col({ name: 'end_date', type: 'date', ordinalPosition: 2 }),
            col({ name: 'owner_id', type: 'bigint', ordinalPosition: 3 }),
            col({ name: 'slug', type: 'text', ordinalPosition: 4 }),
          ],
          foreignKeys: [],
          indexes: [],
          constraints: [
            { name: 'uq_owner_slug', kind: 'UNIQUE', columns: ['owner_id', 'slug'] },
            { name: 'chk_dates', kind: 'CHECK', expression: 'start_date < end_date' },
          ],
        },
      ],
    };
    const t = inspectionToProject(data, 'x').tables[0];
    expect(t.constraints).toHaveLength(2);
    const uq = t.constraints!.find(c => c.name === 'uq_owner_slug')!;
    expect(uq.kind).toBe('UNIQUE');
    expect(uq.fieldIds).toHaveLength(2);
    const ownerField = t.fields.find(f => f.name === 'owner_id')!;
    const slugField = t.fields.find(f => f.name === 'slug')!;
    expect(uq.fieldIds).toEqual([ownerField.id, slugField.id]);
    const chk = t.constraints!.find(c => c.name === 'chk_dates')!;
    expect(chk.kind).toBe('CHECK');
    expect(chk.expression).toBe('start_date < end_date');
  });

  it('注释与可空被保留', () => {
    const data: InspectData = {
      enums: [],
      tables: [
        {
          name: 't',
          schema: 'public',
          comment: 'a table',
          columns: [col({ name: 'x', type: 'text', nullable: false, comment: 'a col' })],
          foreignKeys: [],
          indexes: [],
        },
      ],
    };
    const p = inspectionToProject(data, 'x');
    expect(p.tables[0].comment).toBe('a table');
    expect(p.tables[0].fields[0]).toMatchObject({ nullable: false, comment: 'a col' });
  });
});
