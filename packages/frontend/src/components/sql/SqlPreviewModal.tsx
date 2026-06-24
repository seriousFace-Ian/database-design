import {useMemo} from 'react'

import {CopyOutlined, DownloadOutlined} from '@ant-design/icons'
import {Button, Empty, message, Modal, Space} from 'antd'
import type React from 'react'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {oneDark} from 'react-syntax-highlighter/dist/esm/styles/prism'

import {useProjectStore} from '@/store/projectStore'
import {useUiStore} from '@/store/uiStore'
import {generateProjectDdl} from '@/utils/sqlGenerator'

const SqlPreviewModal: React.FC = () => {
  const {sqlPreviewOpen, setSqlPreviewOpen} = useUiStore()
  const {project} = useProjectStore()

  // 仅在弹窗打开且有项目时生成，避免不必要的计算
  const sql = useMemo(
    () => (sqlPreviewOpen && project ? generateProjectDdl(project) : ''),
    [sqlPreviewOpen, project]
  )

  const hasContent = !!project && project.tables.length > 0

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => message.success('已复制到剪贴板'))
  }

  const handleDownload = () => {
    const blob = new Blob([sql], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name ?? 'schema'}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      footer={
        <Space>
          <Button disabled={!hasContent} icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          <Button disabled={!hasContent} icon={<DownloadOutlined />} onClick={handleDownload}>
            下载 .sql
          </Button>
          <Button type="primary" onClick={() => setSqlPreviewOpen(false)}>
            关闭
          </Button>
        </Space>
      }
      open={sqlPreviewOpen}
      title="SQL 预览"
      width={800}
      onCancel={() => setSqlPreviewOpen(false)}
    >
      {hasContent ? (
        <SyntaxHighlighter
          wrapLongLines
          customStyle={{
            margin: 0,
            borderRadius: 6,
            maxHeight: 480,
            fontSize: 13,
            lineHeight: 1.6,
          }}
          language="sql"
          style={oneDark}
        >
          {sql}
        </SyntaxHighlighter>
      ) : (
        <Empty description="还没有可生成 SQL 的表" />
      )}
    </Modal>
  )
}

export default SqlPreviewModal
