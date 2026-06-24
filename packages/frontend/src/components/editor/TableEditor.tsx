import {CopyOutlined, PlusOutlined, TableOutlined} from '@ant-design/icons'
import {App, Button, Empty, Space, Tabs, Typography} from 'antd'
import type React from 'react'

import {useProjectStore} from '@/store/projectStore'
import {useUiStore} from '@/store/uiStore'
import {tableToMarkdown} from '@/utils/markdownExporter'

import FieldsTable from './FieldsTable'
import TableConstraintsPanel from './TableConstraintsPanel'
import TableIndexesPanel from './TableIndexesPanel'
import TableMetaForm from './TableMetaForm'

const {Title, Text} = Typography

const TableEditor: React.FC = () => {
  const {project, addField} = useProjectStore()
  const {selectedTableId} = useUiStore()
  const {message} = App.useApp()

  const table = project?.tables.find(t => t.id === selectedTableId)

  if (!project) {
    return (
      <Empty
        description={
          <Space direction="vertical" size={4}>
            <Text>请新建或打开项目</Text>
            <Text style={{fontSize: 12}} type="secondary">
              支持 .dbdesign.json 文件
            </Text>
          </Space>
        }
        image={<TableOutlined style={{fontSize: 48, color: '#d9d9d9'}} />}
        style={{marginTop: 120}}
      />
    )
  }

  if (!table) {
    return (
      <Empty
        description="从左侧选择一张表，或新建表"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{marginTop: 120}}
      />
    )
  }

  const handleCopyMarkdown = async () => {
    if (!table || !project) return
    const md = tableToMarkdown(table, project.enums, project.tables)
    try {
      await navigator.clipboard.writeText(md)
      message.success('已复制 Markdown 到剪贴板')
    } catch {
      message.error('复制失败，请检查浏览器剪贴板权限')
    }
  }

  return (
    <div style={{height: '100%', display: 'flex', flexDirection: 'column', padding: '16px 24px'}}>
      {/* 表头 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{margin: 0}}>
          <TableOutlined style={{marginRight: 8, color: '#1677ff'}} />
          {table.schema}.{table.name}
        </Title>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => addField(table.id)}>
            添加字段
          </Button>
          <Button icon={<CopyOutlined />} onClick={handleCopyMarkdown}>
            复制 Markdown
          </Button>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="fields"
        items={[
          {
            key: 'fields',
            label: `字段 (${table.fields.length})`,
            children: <FieldsTable table={table} />,
          },
          {
            key: 'constraints',
            label: `约束 (${table.constraints?.length ?? 0})`,
            children: <TableConstraintsPanel table={table} />,
          },
          {
            key: 'indexes',
            label: `索引 (${table.indexes?.length ?? 0})`,
            children: <TableIndexesPanel table={table} />,
          },
          {
            key: 'meta',
            label: '表信息',
            children: <TableMetaForm table={table} />,
          },
        ]}
        style={{flex: 1}}
      />
    </div>
  )
}

export default TableEditor
