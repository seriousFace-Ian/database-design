import {useState} from 'react'

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import {Dropdown, Input, Modal, Space, theme, Typography} from 'antd'
import type React from 'react'

import {useProjectStore} from '@/store/projectStore'
import type {TableCategory} from '@/types/schema'

const {Text} = Typography

interface Props {
  category: TableCategory
  tableCount: number
  expanded: boolean
  isDropTarget?: boolean
}

const CategoryNodeTitle: React.FC<Props> = ({category, tableCount, expanded, isDropTarget}) => {
  const {renameCategory, deleteCategory} = useProjectStore()
  const {token} = theme.useToken()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category.name)

  const handleRename = () => {
    const name = renameValue.trim()
    if (name && name !== category.name) {
      renameCategory(category.id, name)
    }
    setRenaming(false)
  }

  const handleDelete = () => {
    Modal.confirm({
      title: `删除分组 "${category.name}"？`,
      content:
        tableCount > 0
          ? `该分组下 ${tableCount} 张表将变为「未分类」，不会被删除。`
          : '该分组为空，将直接删除。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: {danger: true},
      onOk: () => deleteCategory(category.id),
    })
  }

  return (
    <div
      className={isDropTarget ? 'sidebar-drop-target' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '0 4px 0 0',
        boxSizing: 'border-box',
      }}
    >
      {expanded ? (
        <FolderOpenOutlined style={{marginRight: 6, color: token.colorWarning, flexShrink: 0}} />
      ) : (
        <FolderOutlined style={{marginRight: 6, color: token.colorWarning, flexShrink: 0}} />
      )}

      {renaming ? (
        <Input
          autoFocus
          size="small"
          style={{flex: 1}}
          value={renameValue}
          onBlur={handleRename}
          onChange={e => setRenameValue(e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Escape') setRenaming(false)
          }}
          onPressEnter={handleRename}
        />
      ) : (
        <Text
          strong
          style={{
            flex: 1,
            fontSize: 13,
            color: token.colorText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {category.name}
          <Text style={{fontSize: 11, marginLeft: 4, fontWeight: 'normal'}} type="secondary">
            ({tableCount})
          </Text>
        </Text>
      )}

      {isDropTarget && (
        <Text
          style={{
            fontSize: 11,
            color: token.colorPrimary,
            marginRight: 6,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <DownloadOutlined /> 放入此分组
        </Text>
      )}

      <Dropdown
        menu={{
          items: [
            {
              key: 'rename',
              icon: <EditOutlined />,
              label: '重命名',
              onClick: ({domEvent}) => {
                domEvent.stopPropagation()
                setRenameValue(category.name)
                setRenaming(true)
              },
            },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              label: '删除分组',
              danger: true,
              onClick: ({domEvent}) => {
                domEvent.stopPropagation()
                handleDelete()
              },
            },
          ],
        }}
        trigger={['click']}
      >
        <Space
          style={{
            padding: '2px 4px',
            borderRadius: 4,
            color: token.colorTextSecondary,
            flexShrink: 0,
          }}
          onClick={e => e.stopPropagation()}
        >
          <MoreOutlined />
        </Space>
      </Dropdown>
    </div>
  )
}

export default CategoryNodeTitle
