import React, { useState } from 'react';
import { Typography, Dropdown, Modal, Input, Space, theme } from 'antd';
import {
  TableOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import type { TableDefinition } from '@/types/schema';

const { Text } = Typography;

interface Props {
  table: TableDefinition;
  isSelected: boolean;
  onSelect: () => void;
}

const TableListItem: React.FC<Props> = ({ table, isSelected, onSelect }) => {
  const { updateTable, deleteTable } = useProjectStore();
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

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 12px',
        cursor: 'pointer',
        background: isSelected ? token.controlItemBgActive : 'transparent',
        borderLeft: `3px solid ${isSelected ? token.colorPrimary : 'transparent'}`,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = token.controlItemBgHover;
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <TableOutlined
        style={{ marginRight: 8, color: isSelected ? token.colorPrimary : token.colorTextSecondary, flexShrink: 0 }}
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
          onKeyDown={e => { if (e.key === 'Escape') setRenaming(false); }}
          style={{ flex: 1 }}
        />
      ) : (
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            color: isSelected ? token.colorPrimary : token.colorText,
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

      <Dropdown
        trigger={['click']}
        menu={{
          items: [
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
              key: 'delete',
              icon: <DeleteOutlined />,
              label: '删除',
              danger: true,
              onClick: ({ domEvent }) => {
                domEvent.stopPropagation();
                handleDelete();
              },
            },
          ],
        }}
      >
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
