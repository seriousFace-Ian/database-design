import React, { useMemo, useState } from 'react';
import {
  Button,
  Input,
  Space,
  Typography,
  Tooltip,
  Empty,
  Modal,
  Form,
  Tree,
  theme,
} from 'antd';
import type { TreeProps, TreeDataNode } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  TableOutlined,
  AppstoreOutlined,
  FolderAddOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import TableListItem from './TableListItem';
import CategoryNodeTitle from './CategoryNodeTitle';
import './Sidebar.css';

const { Text } = Typography;

const TABLE_KEY_PREFIX = 'tab-';
const CATEGORY_KEY_PREFIX = 'cat-';

const tableKey = (id: string) => `${TABLE_KEY_PREFIX}${id}`;
const categoryKey = (id: string) => `${CATEGORY_KEY_PREFIX}${id}`;

const parseKey = (key: React.Key): { type: 'table' | 'category'; id: string } | null => {
  const s = String(key);
  if (s.startsWith(TABLE_KEY_PREFIX)) return { type: 'table', id: s.slice(TABLE_KEY_PREFIX.length) };
  if (s.startsWith(CATEGORY_KEY_PREFIX)) return { type: 'category', id: s.slice(CATEGORY_KEY_PREFIX.length) };
  return null;
};

const Sidebar: React.FC = () => {
  const {
    project,
    addTable,
    addCategory,
    moveTableToCategory,
    reorderCategories,
  } = useProjectStore();
  const { selectedTableId, selectTable, setEnumManagerOpen } = useUiStore();
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [tableForm] = Form.useForm<{ name: string }>();
  const [categoryForm] = Form.useForm<{ name: string }>();

  const tables = project?.tables ?? [];
  const categories = useMemo(
    () => [...(project?.categories ?? [])].sort((a, b) => a.order - b.order),
    [project?.categories],
  );

  // 默认展开全部分组；只跟踪「被用户折叠」的分组 id，
  // 这样新增分组天然处于展开状态，刷新前不持久化（V1 简化）
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
  const expandedKeys = useMemo(
    () =>
      categories
        .filter(c => !collapsedCategoryIds.has(c.id))
        .map(c => categoryKey(c.id)),
    [categories, collapsedCategoryIds],
  );

  // 拖拽状态追踪：用于在「表拖到分组上」时高亮目标分组
  const [dragNodeType, setDragNodeType] = useState<'table' | 'category' | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // 推导出当前正在被悬停的分组 id —— 落在分组节点或落在分组内的某张表都算
  const hoverCategoryId = useMemo(() => {
    if (!dragOverKey || dragNodeType !== 'table') return null;
    const parsed = parseKey(dragOverKey);
    if (!parsed) return null;
    if (parsed.type === 'category') return parsed.id;
    const t = tables.find(x => x.id === parsed.id);
    return t?.categoryId ?? null;
  }, [dragOverKey, dragNodeType, tables]);

  const filteredFlat = useMemo(
    () =>
      search
        ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
        : null,
    [search, tables],
  );

  const treeData = useMemo<TreeDataNode[]>(() => {
    if (filteredFlat) return [];
    const categoryIds = new Set(categories.map(c => c.id));
    const tablesByCategory = new Map<string, typeof tables>();
    const uncategorized: typeof tables = [];
    for (const t of tables) {
      if (t.categoryId && categoryIds.has(t.categoryId)) {
        const list = tablesByCategory.get(t.categoryId) ?? [];
        list.push(t);
        tablesByCategory.set(t.categoryId, list);
      } else {
        uncategorized.push(t);
      }
    }

    const categoryNodes: TreeDataNode[] = categories.map(cat => {
      const children = tablesByCategory.get(cat.id) ?? [];
      return {
        key: categoryKey(cat.id),
        selectable: false,
        title: (
          <CategoryNodeTitle
            category={cat}
            tableCount={children.length}
            expanded={expandedKeys.includes(categoryKey(cat.id))}
            isDropTarget={hoverCategoryId === cat.id}
          />
        ),
        children: children.map(t => ({
          key: tableKey(t.id),
          isLeaf: true,
          title: <TableListItem table={t} categories={categories} />,
        })),
      };
    });

    const uncategorizedNodes: TreeDataNode[] = uncategorized.map(t => ({
      key: tableKey(t.id),
      isLeaf: true,
      title: <TableListItem table={t} categories={categories} />,
    }));

    return [...categoryNodes, ...uncategorizedNodes];
  }, [filteredFlat, categories, tables, expandedKeys, hoverCategoryId]);

  const handleAddTable = async () => {
    const values = await tableForm.validateFields();
    const id = addTable(values.name.trim());
    selectTable(id);
    setAddModalOpen(false);
    tableForm.resetFields();
  };

  const handleAddCategory = async () => {
    const values = await categoryForm.validateFields();
    addCategory(values.name.trim());
    setAddCategoryModalOpen(false);
    categoryForm.resetFields();
  };

  const handleTreeSelect: TreeProps['onSelect'] = (_keys, info) => {
    const parsed = info.node ? parseKey(info.node.key) : null;
    if (parsed?.type === 'table') {
      selectTable(parsed.id);
    }
  };

  const handleExpand: TreeProps['onExpand'] = (_keys, info) => {
    const parsed = parseKey(info.node.key);
    if (parsed?.type !== 'category') return;
    setCollapsedCategoryIds(prev => {
      const next = new Set(prev);
      if (info.expanded) next.delete(parsed.id);
      else next.add(parsed.id);
      return next;
    });
  };

  const handleDragStart: TreeProps['onDragStart'] = info => {
    const parsed = parseKey(info.node.key);
    setDragNodeType(parsed?.type ?? null);
  };

  const handleDragEnter: TreeProps['onDragEnter'] = info => {
    setDragOverKey(String(info.node.key));
  };

  const handleDragEnd: TreeProps['onDragEnd'] = () => {
    setDragNodeType(null);
    setDragOverKey(null);
  };

  const handleDrop: TreeProps['onDrop'] = info => {
    const drag = parseKey(info.dragNode.key);
    const target = parseKey(info.node.key);
    setDragNodeType(null);
    setDragOverKey(null);
    if (!drag || !target) return;

    // 拖动数据表
    if (drag.type === 'table') {
      // 落点是分组节点：放入该分组
      if (target.type === 'category' && !info.dropToGap) {
        moveTableToCategory(drag.id, target.id);
        return;
      }
      // 落点是分组节点的 gap 上：根据 dropPosition 决定上方/下方
      // 简化处理：把表放到「该分组父级」== 顶层未分类
      if (target.type === 'category' && info.dropToGap) {
        moveTableToCategory(drag.id, null);
        return;
      }
      // 落点是另一张表：跟随目标表所在分组
      if (target.type === 'table') {
        const targetTable = tables.find(t => t.id === target.id);
        if (!targetTable) return;
        const targetCat = targetTable.categoryId;
        const categoryExists = targetCat && categories.some(c => c.id === targetCat);
        moveTableToCategory(drag.id, categoryExists ? targetCat! : null);
        return;
      }
    }

    // 拖动分组 → 在分组之间重排（落点必须也是分组，且在 gap 上）
    if (drag.type === 'category') {
      if (target.type !== 'category') return;
      const fromIndex = categories.findIndex(c => c.id === drag.id);
      const targetIndex = categories.findIndex(c => c.id === target.id);
      if (fromIndex === -1 || targetIndex === -1) return;
      // dropPosition: -1 = 在目标上方, 1 = 在目标下方, 0 = 进入目标（拒绝，单层结构）
      if (!info.dropToGap) return;
      let toIndex = info.dropPosition < 0 ? targetIndex : targetIndex + 1;
      // 拖向后方时，原索引被移除会让目标位下移一格
      if (fromIndex < toIndex) toIndex -= 1;
      if (toIndex === fromIndex) return;
      reorderCategories(fromIndex, toIndex);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13 }}>
            <TableOutlined style={{ marginRight: 6, color: '#1677ff' }} />
            数据表
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
              ({tables.length})
            </Text>
          </Text>
          <Space size={4}>
            <Tooltip title="枚举类型管理">
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => setEnumManagerOpen(true)}
                disabled={!project}
              />
            </Tooltip>
            <Tooltip title="新建分组">
              <Button
                size="small"
                icon={<FolderAddOutlined />}
                onClick={() => setAddCategoryModalOpen(true)}
                disabled={!project}
              />
            </Tooltip>
            <Tooltip title="新建表">
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddModalOpen(true)}
                disabled={!project}
              />
            </Tooltip>
          </Space>
        </div>
        <Input
          size="small"
          placeholder="搜索表名..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          disabled={!project}
        />
      </div>

      {/* 表列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {!project ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请新建或打开项目"
            style={{ marginTop: 40 }}
          />
        ) : filteredFlat ? (
          // 搜索模式：平铺命中结果，不再分组渲染
          filteredFlat.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="未找到匹配的表"
              style={{ marginTop: 40 }}
            />
          ) : (
            <div style={{ padding: '0 8px' }}>
              {filteredFlat.map(t => (
                <div
                  key={t.id}
                  onClick={() => selectTable(t.id)}
                  style={{
                    padding: '4px 4px',
                    cursor: 'pointer',
                    background: t.id === selectedTableId ? token.controlItemBgActive : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  <TableListItem table={t} categories={categories} />
                </div>
              ))}
            </div>
          )
        ) : tables.length === 0 && categories.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="点击 + 新建第一张表，或新建分组归纳"
            style={{ marginTop: 40 }}
          />
        ) : (
          <Tree
            className="sidebar-tree"
            treeData={treeData}
            blockNode
            draggable={{ icon: false }}
            selectedKeys={selectedTableId ? [tableKey(selectedTableId)] : []}
            expandedKeys={expandedKeys}
            onExpand={handleExpand}
            onSelect={handleTreeSelect}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            style={{ background: 'transparent', padding: '0 4px' }}
          />
        )}
      </div>

      {/* 新建表弹窗 */}
      <Modal
        title="新建数据表"
        open={addModalOpen}
        onOk={handleAddTable}
        onCancel={() => { setAddModalOpen(false); tableForm.resetFields(); }}
        okText="创建"
        cancelText="取消"
        width={360}
      >
        <Form form={tableForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="表名"
            rules={[
              { required: true, message: '请输入表名' },
              { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '表名只能包含字母、数字和下划线，且不能以数字开头' },
            ]}
          >
            <Input placeholder="例如：users" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建分组弹窗 */}
      <Modal
        title="新建分组"
        open={addCategoryModalOpen}
        onOk={handleAddCategory}
        onCancel={() => { setAddCategoryModalOpen(false); categoryForm.resetFields(); }}
        okText="创建"
        cancelText="取消"
        width={360}
      >
        <Form form={categoryForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="分组名称"
            rules={[{ required: true, message: '请输入分组名称' }]}
          >
            <Input placeholder="例如：用户模块" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Sidebar;
