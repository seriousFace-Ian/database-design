import { describe, it, expect } from 'vitest';
import {
  generateDdlSections,
  generateDdlStatements,
  generateProjectDdl,
} from './sqlGenerator';
import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  IndexDefinition,
} from '@/types/schema';

// ==================== 测试夹具 ====================

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

function table(overrides: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: 't1',
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
    name: 'test_project',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    enums: [],
    tables: [],
    ...overrides,
  };
}

// ==================== 列类型与约束 ====================

describe('列定义', () => {
  it('渲染长度 / 精度 / 数组 / NOT NULL / DEFAULT / UNIQUE', () => {
    const p = project({
      tables: [
        table({
          fields: [
            field({ name: 'id', type: 'SERIAL', isPrimaryKey: true, nullable: false }),
            field({ name: 'title', type: 'VARCHAR', length: 200, nullable: false }),
            field({ name: 'price', type: 'NUMERIC', precision: 10, scale: 2 }),
            field({ name: 'tags', type: 'TEXT', isArray: true }),
            field({ name: 'sku', type: 'TEXT', isUnique: true }),
            field({ name: 'status', type: 'INTEGER', defaultValue: '0' }),
          ],
        }),
      ],
    });

    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).toContain('"title" VARCHAR(200) NOT NULL');
    expect(ddl).toContain('"price" NUMERIC(10, 2)');
    expect(ddl).toContain('"tags" TEXT[]');
    expect(ddl).toContain('"sku" TEXT UNIQUE');
    expect(ddl).toContain('"status" INTEGER DEFAULT 0');
    // 主键列不重复输出 NOT NULL，由表级 PRIMARY KEY 保证
    expect(ddl).toContain('"id" SERIAL');
    expect(ddl).not.toContain('"id" SERIAL NOT NULL');
  });

  it('CHECK 约束内联到列', () => {
    const p = project({
      tables: [
        table({
          fields: [field({ name: 'age', type: 'INTEGER', checkConstraint: 'age >= 0' })],
        }),
      ],
    });
    expect(generateDdlSections(p).tables[0]).toContain('"age" INTEGER CHECK (age >= 0)');
  });

  it('复合主键输出表级 PRIMARY KEY', () => {
    const p = project({
      tables: [
        table({
          fields: [
            field({ name: 'order_id', isPrimaryKey: true, nullable: false }),
            field({ name: 'product_id', isPrimaryKey: true, nullable: false }),
          ],
        }),
      ],
    });
    expect(generateDdlSections(p).tables[0]).toContain('PRIMARY KEY ("order_id", "product_id")');
  });
});

// ==================== ENUM ====================

describe('ENUM', () => {
  it('生成 CREATE TYPE 并在列上引用限定名', () => {
    const enumDef: EnumType = {
      id: 'e1',
      name: 'order_status',
      schema: 'public',
      values: ['pending', 'paid', 'shipped'],
    };
    const p = project({
      enums: [enumDef],
      tables: [
        table({
          fields: [field({ name: 'status', type: 'USER-DEFINED', enumTypeId: 'e1' })],
        }),
      ],
    });

    const s = generateDdlSections(p);
    expect(s.enums).toEqual([
      `CREATE TYPE "public"."order_status" AS ENUM ('pending', 'paid', 'shipped');`,
    ]);
    expect(s.tables[0]).toContain('"status" "public"."order_status"');
  });

  it('转义 ENUM 值中的单引号', () => {
    const p = project({
      enums: [{ id: 'e1', name: 'kind', schema: 'public', values: ["o'brien"] }],
    });
    expect(generateDdlSections(p).enums[0]).toContain("'o''brien'");
  });

  it('引用缺失的 ENUM 时退化为 TEXT', () => {
    const p = project({
      tables: [
        table({ fields: [field({ name: 'x', type: 'USER-DEFINED', enumTypeId: 'missing' })] }),
      ],
    });
    expect(generateDdlSections(p).tables[0]).toContain('"x" TEXT');
  });
});

// ==================== 外键与拓扑排序 ====================

describe('外键 / 拓扑排序', () => {
  const users = table({
    id: 'users',
    name: 'users',
    fields: [field({ id: 'u_id', name: 'id', isPrimaryKey: true, nullable: false })],
  });
  const posts = table({
    id: 'posts',
    name: 'posts',
    fields: [
      field({ id: 'p_id', name: 'id', isPrimaryKey: true, nullable: false }),
      field({
        id: 'p_author',
        name: 'author_id',
        foreignKey: {
          referenceTableId: 'users',
          referenceFieldId: 'u_id',
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        },
      }),
    ],
  });

  it('被引用表先于引用表创建', () => {
    // 故意把 posts 放前面，验证排序生效
    const p = project({ tables: [posts, users] });
    const names = generateDdlSections(p).tables.map(t => t.match(/CREATE TABLE "public"."(\w+)"/)![1]);
    expect(names.indexOf('users')).toBeLessThan(names.indexOf('posts'));
  });

  it('外键作为独立 ALTER 语句，仅输出非默认动作', () => {
    const p = project({ tables: [posts, users] });
    const fk = generateDdlSections(p).foreignKeys[0];
    expect(fk).toBe(
      'ALTER TABLE "public"."posts" ADD CONSTRAINT "fk_posts_author_id" ' +
        'FOREIGN KEY ("author_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;'
    );
    // onUpdate 为 NO ACTION，不应出现
    expect(fk).not.toContain('ON UPDATE');
  });

  it('使用自定义约束名', () => {
    const custom = table({
      id: 'c',
      name: 'c',
      fields: [
        field({
          name: 'ref',
          foreignKey: {
            referenceTableId: 'users',
            referenceFieldId: 'u_id',
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
            constraintName: 'my_fk',
          },
        }),
      ],
    });
    const p = project({ tables: [users, custom] });
    expect(generateDdlSections(p).foreignKeys[0]).toContain('ADD CONSTRAINT "my_fk"');
  });

  it('循环外键不会无限递归，两表都能创建', () => {
    const a = table({
      id: 'a',
      name: 'a',
      fields: [
        field({ id: 'a_id', name: 'id', isPrimaryKey: true, nullable: false }),
        field({
          id: 'a_b',
          name: 'b_id',
          foreignKey: { referenceTableId: 'b', referenceFieldId: 'b_id', onDelete: 'NO ACTION', onUpdate: 'NO ACTION' },
        }),
      ],
    });
    const b = table({
      id: 'b',
      name: 'b',
      fields: [
        field({ id: 'b_id', name: 'id', isPrimaryKey: true, nullable: false }),
        field({
          id: 'b_a',
          name: 'a_id',
          foreignKey: { referenceTableId: 'a', referenceFieldId: 'a_id', onDelete: 'NO ACTION', onUpdate: 'NO ACTION' },
        }),
      ],
    });
    const p = project({ tables: [a, b] });
    const s = generateDdlSections(p);
    expect(s.tables).toHaveLength(2);
    expect(s.foreignKeys).toHaveLength(2);
  });

  it('忽略指向不存在表的外键', () => {
    const p = project({
      tables: [
        table({
          fields: [
            field({
              name: 'ghost',
              foreignKey: { referenceTableId: 'nope', referenceFieldId: 'x', onDelete: 'NO ACTION', onUpdate: 'NO ACTION' },
            }),
          ],
        }),
      ],
    });
    expect(generateDdlSections(p).foreignKeys).toHaveLength(0);
  });
});

// ==================== 索引 ====================

describe('索引', () => {
  it('复合唯一索引', () => {
    const idx: IndexDefinition = {
      id: 'i1',
      name: 'uq_a_b',
      fieldIds: ['fa', 'fb'],
      isUnique: true,
    };
    const p = project({
      tables: [
        table({
          fields: [field({ id: 'fa', name: 'a' }), field({ id: 'fb', name: 'b' })],
          indexes: [idx],
        }),
      ],
    });
    expect(generateDdlSections(p).indexes[0]).toBe(
      'CREATE UNIQUE INDEX "uq_a_b" ON "public"."tbl" ("a", "b");'
    );
  });

  it('非 BTREE 方法输出 USING', () => {
    const p = project({
      tables: [
        table({
          fields: [field({ id: 'fa', name: 'doc', type: 'JSONB' })],
          indexes: [{ id: 'i1', name: 'gin_doc', fieldIds: ['fa'], isUnique: false, indexType: 'GIN' }],
        }),
      ],
    });
    expect(generateDdlSections(p).indexes[0]).toBe(
      'CREATE INDEX "gin_doc" ON "public"."tbl" USING GIN ("doc");'
    );
  });

  it('字段全部缺失时跳过该索引', () => {
    const p = project({
      tables: [
        table({
          fields: [field({ id: 'fa', name: 'a' })],
          indexes: [{ id: 'i1', name: 'dead', fieldIds: ['gone'], isUnique: false }],
        }),
      ],
    });
    expect(generateDdlSections(p).indexes).toHaveLength(0);
  });
});

// ==================== 注释 ====================

describe('注释', () => {
  it('表与列注释，单引号转义', () => {
    const p = project({
      tables: [
        table({
          comment: "it's a table",
          fields: [field({ name: 'a', comment: 'col a' })],
        }),
      ],
    });
    const c = generateDdlSections(p).comments;
    expect(c).toContain(`COMMENT ON TABLE "public"."tbl" IS 'it''s a table';`);
    expect(c).toContain(`COMMENT ON COLUMN "public"."tbl"."a" IS 'col a';`);
  });
});

// ==================== 整体输出 ====================

describe('整体 DDL', () => {
  it('语句顺序：TYPE → TABLE → FK → INDEX → COMMENT', () => {
    const p = project({
      enums: [{ id: 'e1', name: 'st', schema: 'public', values: ['a'] }],
      tables: [
        table({
          id: 'users',
          name: 'users',
          comment: '用户',
          fields: [field({ id: 'u_id', name: 'id', isPrimaryKey: true, nullable: false })],
          indexes: [{ id: 'i1', name: 'idx_id', fieldIds: ['u_id'], isUnique: false }],
        }),
        table({
          id: 'posts',
          name: 'posts',
          fields: [
            field({ id: 'p_id', name: 'id', isPrimaryKey: true, nullable: false }),
            field({
              id: 'p_u',
              name: 'user_id',
              foreignKey: { referenceTableId: 'users', referenceFieldId: 'u_id', onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
            }),
          ],
        }),
      ],
    });

    const stmts = generateDdlStatements(p);
    const kind = (s: string) =>
      s.startsWith('CREATE TYPE') ? 0
      : s.startsWith('CREATE TABLE') ? 1
      : s.startsWith('ALTER TABLE') ? 2
      : s.startsWith('CREATE INDEX') || s.startsWith('CREATE UNIQUE INDEX') ? 3
      : 4;
    const kinds = stmts.map(kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => a - b));
  });

  it('generateProjectDdl 含分节注释且以换行结尾', () => {
    const p = project({
      tables: [table({ fields: [field({ name: 'id', type: 'SERIAL', isPrimaryKey: true, nullable: false })] })],
    });
    const text = generateProjectDdl(p);
    expect(text).toContain('-- test_project');
    expect(text).toContain('-- 数据表');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('空项目只产出头部注释', () => {
    expect(generateDdlStatements(project())).toEqual([]);
  });
});

// ==================== 标识符转义 ====================

describe('标识符转义', () => {
  it('双引号翻倍', () => {
    const p = project({
      tables: [table({ name: 'we"ird', fields: [field({ name: 'a"b' })] })],
    });
    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).toContain('CREATE TABLE "public"."we""ird"');
    expect(ddl).toContain('"a""b"');
  });
});

// ==================== 表级约束（Phase 7） ====================

describe('表级约束', () => {
  it('UNIQUE(a,b) 内联在 CREATE TABLE 末尾，使用提供的约束名', () => {
    const fa = field({ id: 'fa', name: 'team_id', type: 'BIGINT', nullable: false });
    const fb = field({ id: 'fb', name: 'user_id', type: 'BIGINT', nullable: false });
    const p = project({
      tables: [
        table({
          name: 'team_members',
          fields: [fa, fb],
          constraints: [
            { id: 'c1', name: 'uq_team_user', kind: 'UNIQUE', fieldIds: ['fa', 'fb'] },
          ],
        }),
      ],
    });
    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).toContain('CONSTRAINT "uq_team_user" UNIQUE ("team_id", "user_id")');
  });

  it('CHECK 跨列表达式按原样内联', () => {
    const fa = field({ id: 'fa', name: 'start_date', type: 'DATE' });
    const fb = field({ id: 'fb', name: 'end_date', type: 'DATE' });
    const p = project({
      tables: [
        table({
          name: 'events',
          fields: [fa, fb],
          constraints: [
            { id: 'c1', name: 'chk_dates', kind: 'CHECK', expression: 'start_date < end_date' },
          ],
        }),
      ],
    });
    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).toContain('CONSTRAINT "chk_dates" CHECK (start_date < end_date)');
  });

  it('约束名缺失时自动生成 uq_/chk_ 前缀', () => {
    const fa = field({ id: 'fa', name: 'a', type: 'INTEGER' });
    const fb = field({ id: 'fb', name: 'b', type: 'INTEGER' });
    const p = project({
      tables: [
        table({
          name: 't',
          fields: [fa, fb],
          constraints: [
            { id: 'c1', kind: 'UNIQUE', fieldIds: ['fa', 'fb'] },
            { id: 'c2', kind: 'CHECK', expression: 'a < b' },
          ],
        }),
      ],
    });
    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).toContain('CONSTRAINT "uq_t_a_b" UNIQUE ("a", "b")');
    // CHECK 用哈希后缀，匹配前缀即可
    expect(ddl).toMatch(/CONSTRAINT "chk_t_[a-z0-9]+" CHECK \(a < b\)/);
  });

  it('与列定义、PRIMARY KEY、列级 CHECK 共存且顺序正确', () => {
    const fid = field({ id: 'fid', name: 'id', type: 'BIGSERIAL', isPrimaryKey: true, nullable: false });
    const fa = field({ id: 'fa', name: 'a', type: 'INTEGER', checkConstraint: 'a >= 0' });
    const fb = field({ id: 'fb', name: 'b', type: 'INTEGER' });
    const p = project({
      tables: [
        table({
          name: 't',
          fields: [fid, fa, fb],
          constraints: [
            { id: 'c1', kind: 'UNIQUE', fieldIds: ['fa', 'fb'] },
          ],
        }),
      ],
    });
    const ddl = generateDdlSections(p).tables[0];
    // 列内联 CHECK
    expect(ddl).toContain('"a" INTEGER CHECK (a >= 0)');
    // PRIMARY KEY 在表级约束之前
    const pkIdx = ddl.indexOf('PRIMARY KEY ("id")');
    const uqIdx = ddl.indexOf('CONSTRAINT "uq_t_a_b"');
    expect(pkIdx).toBeGreaterThanOrEqual(0);
    expect(uqIdx).toBeGreaterThan(pkIdx);
  });

  it('引用不存在 fieldId 的 UNIQUE 被跳过，CHECK 表达式为空被跳过', () => {
    const fa = field({ id: 'fa', name: 'a', type: 'INTEGER' });
    const p = project({
      tables: [
        table({
          name: 't',
          fields: [fa],
          constraints: [
            { id: 'c1', kind: 'UNIQUE', fieldIds: ['nonexistent'] },
            { id: 'c2', kind: 'CHECK', expression: '   ' },
          ],
        }),
      ],
    });
    const ddl = generateDdlSections(p).tables[0];
    expect(ddl).not.toContain('CONSTRAINT');
  });
});
