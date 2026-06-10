import React, { useState } from 'react';
import { Typography, Dropdown, Modal, Input, Space, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  TableOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import type { TableCategory, TableDefinition } from '@/types/schema';

const { Text } = Typography;

interface Props {
  table: TableDefinition;
  categories: TableCategory[];
}

const TableListItem: React.FC<Props> = ({ table, categories }) => {
  const { updateTable, deleteTable, moveTableToCategory } = useProjectStore();
  const { selectTable } = useUiStore();
  const { token } = theme.useToken();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(table.name);

  const handleRename = () => {
    const name = renameValue.trim();
    if (name && name !== table.name) {
      updateTable(table.id, { name });
    }
    setRenaming(false);
  };

  const handleDelete = () => {
    Modal.confirm({
      title: `删除表 "${table.name}"？`,
      content: '同时会清理其他表中引用此表的外键关系，此操作不可撤销。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteTable(table.id);
        selectTable(null);
      },
    });
  };

  // 「移动到分组」子菜单：列出所有分组 + 「移出分组」
  const moveMenuItems: MenuProps['items'] = [
    ...categories.map(c => ({
      key: `move-${c.id}`,
      label: c.name,
      disabled: table.categoryId === c.id,
      onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
        domEvent.stopPropagation();
        moveTableToCategory(table.id, c.id);
      },
    })),
    ...(categories.length > 0 ? [{ type: 'divider' as const, key: 'divider' }] : []),
    {
      key: 'move-uncategorized',
      label: '移出分组（未分类）',
      disabled: !table.categoryId,
      onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
        domEvent.stopPropagation();
        moveTableToCategory(table.id, null);
      },
    },
  ];

  const menuItems: MenuProps['items'] = [
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setRenameValue(table.name);
        setRenaming(true);
      },
    },
    {
      key: 'move',
      icon: <SwapOutlined />,
      label: '移动到分组',
      children: moveMenuItems,
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        handleDelete();
      },
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px 0 0',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <TableOutlined
        style={{
          marginRight: 6,
          color: token.colorTextSecondary,
          flexShrink: 0,
        }}
      />

      {renaming ? (
        <Input
          size="small"
          value={renameValue}
          autoFocus
          onClick={e => e.stopPropagation()}
          onChange={e => setRenameValue(e.target.value)}
          onBlur={handleRename}
          onPressEnter={handleRename}
          onKeyDown={e => {
            if (e.key === 'Escape') setRenaming(false);
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            color: token.colorText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {table.name}
          {table.fields.length > 0 && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
              ({table.fields.length})
            </Text>
          )}
        </Text>
      )}

      <Dropdown trigger={['click']} menu={{ items: menuItems }}>
        <Space
          onClick={e => e.stopPropagation()}
          style={{
            padding: '2px 4px',
            borderRadius: 4,
            color: token.colorTextSecondary,
            flexShrink: 0,
          }}
        >
          <MoreOutlined />
        </Space>
      </Dropdown>
    </div>
  );
};

export default TableListItem;
