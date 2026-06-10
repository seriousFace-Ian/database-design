import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectFile,
  TableDefinition,
  FieldDefinition,
  EnumType,
  IndexDefinition,
  TableConstraint,
  TableCategory,
} from '@/types/schema';

const DEFAULT_FIELD: Omit<FieldDefinition, 'id' | 'order'> = {
  name: '',
  type: 'VARCHAR',
  length: 255,
  nullable: true,
  isPrimaryKey: false,
  isUnique: false,
};

// 一键审计字段模板。created_by 默认 BIGINT 可空，方便用户后续按业务关联到用户表外键
const AUDIT_FIELD_TEMPLATES: ReadonlyArray<Omit<FieldDefinition, 'id' | 'order'>> = [
  {
    name: 'created_at', type: 'TIMESTAMPTZ',
    nullable: false, isPrimaryKey: false, isUnique: false,
    defaultValue: 'now()', comment: '创建时间',
  },
  {
    name: 'updated_at', type: 'TIMESTAMPTZ',
    nullable: false, isPrimaryKey: false, isUnique: false,
    defaultValue: 'now()', comment: '更新时间',
  },
  {
    name: 'deleted_at', type: 'TIMESTAMPTZ',
    nullable: true, isPrimaryKey: false, isUnique: false,
    comment: '软删除时间（NULL = 未删除）',
  },
  {
    name: 'created_by', type: 'BIGINT',
    nullable: true, isPrimaryKey: false, isUnique: false,
    comment: '创建者用户 ID',
  },
];

function now(): string {
  return new Date().toISOString();
}

/**
 * 旧索引（Phase 7 之前）以 `fieldIds: string[]` 表达；Phase 8 升级为结构化 `columns`。
 * loadProject 入口拦截，一次性规范化；保存时只写新结构。
 */
function migrateIndex(idx: unknown): IndexDefinition {
  const raw = idx as Partial<IndexDefinition> & { fieldIds?: string[] };
  if (Array.isArray(raw.columns)) {
    return raw as IndexDefinition;
  }
  const fieldIds = Array.isArray(raw.fieldIds) ? raw.fieldIds : [];
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    isUnique: !!raw.isUnique,
    indexType: raw.indexType,
    columns: fieldIds.map(fid => ({ fieldId: fid })),
  };
}

/** 规范化整个 ProjectFile：目前只处理索引结构升级，未来类似拦截可继续加 */
function normalizeProject(file: ProjectFile): ProjectFile {
  const categories = Array.isArray(file.categories) ? file.categories : [];
  const validCategoryIds = new Set(categories.map(c => c.id));
  return {
    ...file,
    categories,
    tables: file.tables.map(t => ({
      ...t,
      // 引用已不存在的分组的表，回落为「未分类」
      categoryId:
        t.categoryId && validCategoryIds.has(t.categoryId) ? t.categoryId : undefined,
      indexes: (t.indexes ?? []).map(migrateIndex),
    })),
  };
}

function createEmptyProject(name: string): ProjectFile {
  return {
    $schema: 'https://dbdesign/schema/v1.json',
    version: '1.0',
    name,
    createdAt: now(),
    updatedAt: now(),
    enums: [],
    tables: [],
    categories: [],
  };
}

interface ProjectState {
  project: ProjectFile | null;
  isDirty: boolean;

  // 项目操作
  newProject: (name: string) => void;
  loadProject: (file: ProjectFile) => void;
  updateProjectMeta: (changes: Partial<Pick<ProjectFile, 'name' | 'description'>>) => void;

  // 表操作
  addTable: (name?: string) => string;
  updateTable: (tableId: string, changes: Partial<Omit<TableDefinition, 'id' | 'fields' | 'indexes'>>) => void;
  deleteTable: (tableId: string) => void;

  // 字段操作
  addField: (tableId: string) => string;
  addAuditFields: (tableId: string) => { added: string[]; skipped: string[] };
  updateField: (tableId: string, fieldId: string, changes: Partial<FieldDefinition>) => void;
  deleteField: (tableId: string, fieldId: string) => void;
  reorderFields: (tableId: string, fromIndex: number, toIndex: number) => void;

  // 索引操作
  addIndex: (tableId: string, index: Omit<IndexDefinition, 'id'>) => string;
  updateIndex: (tableId: string, indexId: string, changes: Partial<Omit<IndexDefinition, 'id'>>) => void;
  deleteIndex: (tableId: string, indexId: string) => void;

  // 表级约束操作（UNIQUE / CHECK）
  addTableConstraint: (tableId: string, constraint: Omit<TableConstraint, 'id'>) => string;
  updateTableConstraint: (tableId: string, constraintId: string, changes: Partial<Omit<TableConstraint, 'id'>>) => void;
  deleteTableConstraint: (tableId: string, constraintId: string) => void;

  // ENUM 操作
  addEnum: (enumDef: Omit<EnumType, 'id'>) => string;
  updateEnum: (enumId: string, changes: Partial<Omit<EnumType, 'id'>>) => void;
  deleteEnum: (enumId: string) => void;

  // 数据表分组（Sidebar 文件夹）
  addCategory: (name: string) => string;
  renameCategory: (categoryId: string, name: string) => void;
  deleteCategory: (categoryId: string) => void;
  reorderCategories: (fromIndex: number, toIndex: number) => void;
  moveTableToCategory: (tableId: string, categoryId: string | null) => void;

  // 图表布局
  updateTablePosition: (tableId: string, position: { x: number; y: number }) => void;
  updateDiagramLayout: (zoom: number, position: { x: number; y: number }) => void;

  // 持久化标记
  markSaved: () => void;
}

export const useProjectStore = create<ProjectState>()(
  // 步骤撤销逻辑
  temporal(
    (set, get) => ({
      project: null,
      isDirty: false,

      newProject: (name) => {
        set({ project: createEmptyProject(name), isDirty: false });
      },

      loadProject: (file) => {
        set({ project: normalizeProject(file), isDirty: false });
      },

      updateProjectMeta: (changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: { ...project, ...changes, updatedAt: now() },
          isDirty: true,
        });
      },

      addTable: (name = '新建表') => {
        const { project } = get();
        if (!project) return '';
        const id = uuidv4();
        const newTable: TableDefinition = {
          id,
          name,
          schema: 'public',
          fields: [],
          indexes: [],
          createdAt: now(),
          updatedAt: now(),
        };
        set({
          project: {
            ...project,
            tables: [...project.tables, newTable],
            updatedAt: now(),
          },
          isDirty: true,
        });
        return id;
      },

      updateTable: (tableId, changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId ? { ...t, ...changes, updatedAt: now() } : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteTable: (tableId) => {
        const { project } = get();
        if (!project) return;
        // 同时清理其他表中引用此表的外键
        const tables = project.tables
          .filter(t => t.id !== tableId)
          .map(t => ({
            ...t,
            fields: t.fields.map(f =>
              f.foreignKey?.referenceTableId === tableId
                ? { ...f, foreignKey: undefined }
                : f
            ),
          }));
        set({
          project: { ...project, tables, updatedAt: now() },
          isDirty: true,
        });
      },

      addField: (tableId) => {
        const { project } = get();
        if (!project) return '';
        const table = project.tables.find(t => t.id === tableId);
        if (!table) return '';
        const fieldId = uuidv4();
        const newField: FieldDefinition = {
          ...DEFAULT_FIELD,
          id: fieldId,
          name: `field_${table.fields.length + 1}`,
          order: table.fields.length,
        };
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, fields: [...t.fields, newField], updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
        return fieldId;
      },

      addAuditFields: (tableId) => {
        const { project } = get();
        if (!project) return { added: [], skipped: [] };
        const table = project.tables.find(t => t.id === tableId);
        if (!table) return { added: [], skipped: [] };

        const existingNames = new Set(table.fields.map(f => f.name));
        const added: string[] = [];
        const skipped: string[] = [];
        const newFields: FieldDefinition[] = [];
        let order = table.fields.length;

        for (const proto of AUDIT_FIELD_TEMPLATES) {
          if (existingNames.has(proto.name)) {
            skipped.push(proto.name);
            continue;
          }
          newFields.push({ ...proto, id: uuidv4(), order: order++ });
          added.push(proto.name);
        }

        if (newFields.length === 0) return { added, skipped };

        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, fields: [...t.fields, ...newFields], updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
        return { added, skipped };
      },

      updateField: (tableId, fieldId, changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? {
                    ...t,
                    fields: t.fields.map(f => (f.id === fieldId ? { ...f, ...changes } : f)),
                    updatedAt: now(),
                  }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteField: (tableId, fieldId) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? {
                    ...t,
                    fields: t.fields
                      .filter(f => f.id !== fieldId)
                      .map((f, i) => ({ ...f, order: i })),
                    updatedAt: now(),
                  }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      reorderFields: (tableId, fromIndex, toIndex) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t => {
              if (t.id !== tableId) return t;
              const fields = [...t.fields];
              const [moved] = fields.splice(fromIndex, 1);
              fields.splice(toIndex, 0, moved);
              return {
                ...t,
                fields: fields.map((f, i) => ({ ...f, order: i })),
                updatedAt: now(),
              };
            }),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      addIndex: (tableId, index) => {
        const { project } = get();
        if (!project) return '';
        const id = uuidv4();
        const newIndex: IndexDefinition = { ...index, id };
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, indexes: [...t.indexes, newIndex], updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
        return id;
      },

      updateIndex: (tableId, indexId, changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? {
                    ...t,
                    indexes: (t.indexes ?? []).map(i =>
                      i.id === indexId ? { ...i, ...changes } : i
                    ),
                    updatedAt: now(),
                  }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteIndex: (tableId, indexId) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, indexes: t.indexes.filter(i => i.id !== indexId), updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      addTableConstraint: (tableId, constraint) => {
        const { project } = get();
        if (!project) return '';
        const id = uuidv4();
        const newConstraint: TableConstraint = { ...constraint, id };
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, constraints: [...(t.constraints ?? []), newConstraint], updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
        return id;
      },

      updateTableConstraint: (tableId, constraintId, changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? {
                    ...t,
                    constraints: (t.constraints ?? []).map(c =>
                      c.id === constraintId ? { ...c, ...changes } : c
                    ),
                    updatedAt: now(),
                  }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteTableConstraint: (tableId, constraintId) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? {
                    ...t,
                    constraints: (t.constraints ?? []).filter(c => c.id !== constraintId),
                    updatedAt: now(),
                  }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      addEnum: (enumDef) => {
        const { project } = get();
        if (!project) return '';
        const id = uuidv4();
        set({
          project: {
            ...project,
            enums: [...project.enums, { ...enumDef, id }],
            updatedAt: now(),
          },
          isDirty: true,
        });
        return id;
      },

      updateEnum: (enumId, changes) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            enums: project.enums.map(e => (e.id === enumId ? { ...e, ...changes } : e)),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteEnum: (enumId) => {
        const { project } = get();
        if (!project) return;
        // 将使用此 ENUM 的字段类型重置为 TEXT
        const tables = project.tables.map(t => ({
          ...t,
          fields: t.fields.map(f =>
            f.enumTypeId === enumId
              ? { ...f, type: 'TEXT' as const, enumTypeId: undefined }
              : f
          ),
        }));
        set({
          project: {
            ...project,
            enums: project.enums.filter(e => e.id !== enumId),
            tables,
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      addCategory: (name) => {
        const { project } = get();
        if (!project) return '';
        const id = uuidv4();
        const existing = project.categories ?? [];
        const newCategory: TableCategory = { id, name, order: existing.length };
        set({
          project: {
            ...project,
            categories: [...existing, newCategory],
            updatedAt: now(),
          },
          isDirty: true,
        });
        return id;
      },

      renameCategory: (categoryId, name) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            categories: (project.categories ?? []).map(c =>
              c.id === categoryId ? { ...c, name } : c
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      deleteCategory: (categoryId) => {
        const { project } = get();
        if (!project) return;
        const remaining = (project.categories ?? [])
          .filter(c => c.id !== categoryId)
          .map((c, i) => ({ ...c, order: i }));
        set({
          project: {
            ...project,
            categories: remaining,
            tables: project.tables.map(t =>
              t.categoryId === categoryId ? { ...t, categoryId: undefined } : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      reorderCategories: (fromIndex, toIndex) => {
        const { project } = get();
        if (!project) return;
        const list = [...(project.categories ?? [])];
        if (fromIndex < 0 || fromIndex >= list.length) return;
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        set({
          project: {
            ...project,
            categories: list.map((c, i) => ({ ...c, order: i })),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      moveTableToCategory: (tableId, categoryId) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId
                ? { ...t, categoryId: categoryId ?? undefined, updatedAt: now() }
                : t
            ),
            updatedAt: now(),
          },
          isDirty: true,
        });
      },

      updateTablePosition: (tableId, position) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tables: project.tables.map(t =>
              t.id === tableId ? { ...t, position } : t
            ),
          },
          isDirty: true,
        });
      },

      updateDiagramLayout: (zoom, position) => {
        const { project } = get();
        if (!project) return;
        set({
          project: { ...project, diagramLayout: { zoom, position } },
          isDirty: true,
        });
      },

      markSaved: () => {
        set({ isDirty: false });
      },
    }),
    {
      // 仅对影响数据结构的操作记录历史，节点位置 / 画布视口都剔除
      // 否则拖动节点、平移缩放会污染撤销栈
      partialize: (state) => ({
        project: state.project
          ? {
              ...state.project,
              diagramLayout: undefined,
              tables: state.project.tables.map(t => ({ ...t, position: undefined })),
            }
          : null,
      }),
      limit: 50,
    }
  )
);
