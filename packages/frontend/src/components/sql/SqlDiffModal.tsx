import {useState} from 'react'

import {
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {Alert, App, Button, Collapse, Empty, Modal, Space, Spin, Tag, Typography} from 'antd'
import type React from 'react'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {oneDark} from 'react-syntax-highlighter/dist/esm/styles/prism'

import {inspectSchema} from '@/api/connection'
import {useConnectionStore} from '@/store/connectionStore'
import {useProjectStore} from '@/store/projectStore'
import {useUiStore} from '@/store/uiStore'
import {
  computeSchemaDiff,
  countDiffChanges,
  flattenDiffSql,
  isEmptyDiff,
  renderDiffSql,
  type SchemaDiff,
} from '@/utils/schemaDiff'
import {inspectionToProject} from '@/utils/schemaImporter'

const {Text} = Typography

const SqlDiffModal: React.FC = () => {
  const {message} = App.useApp()
  const {sqlDiffOpen, setSqlDiffOpen} = useUiStore()
  const {project} = useProjectStore()
  const {config, status} = useConnectionStore()

  const [loading, setLoading] = useState(false)
  const [diff, setDiff] = useState<SchemaDiff | null>(null)
  const [sql, setSql] = useState<string>('')

  const connected = status === 'connected'

  const runDiff = async () => {
    if (!project) return
    setLoading(true)
    setDiff(null)
    setSql('')
    try {
      const res = await inspectSchema(config)
      if (!res.success) {
        message.error('读取数据库结构失败')
        return
      }
      const current = inspectionToProject(res.data, config.database || 'current')
      const d = computeSchemaDiff(current, project)
      const sections = renderDiffSql(d, project.enums, project.tables)
      setDiff(d)
      setSql(flattenDiffSql(sections).join('\n'))
    } catch (e) {
      message.error(e instanceof Error ? e.message : '对比失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (!sql) return
    navigator.clipboard.writeText(sql).then(() => message.success('已复制到剪贴板'))
  }

  const handleDownload = () => {
    if (!sql) return
    const blob = new Blob([sql], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name ?? 'schema'}.diff.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setDiff(null)
    setSql('')
  }

  const stats = diff ? countDiffChanges(diff) : null

  return (
    <Modal
      footer={
        <Space>
          <Button disabled={!sql} icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          <Button disabled={!sql} icon={<DownloadOutlined />} onClick={handleDownload}>
            下载 .sql
          </Button>
          <Button
            disabled={!connected || !project}
            icon={<ReloadOutlined />}
            loading={loading}
            type="primary"
            onClick={runDiff}
          >
            {diff ? '重新对比' : '运行对比'}
          </Button>
          <Button
            onClick={() => {
              setSqlDiffOpen(false)
              reset()
            }}
          >
            关闭
          </Button>
        </Space>
      }
      open={sqlDiffOpen}
      title="对比设计与数据库现状"
      width={880}
      onCancel={() => {
        setSqlDiffOpen(false)
        reset()
      }}
    >
      {!connected && (
        <Alert
          showIcon
          message="尚未连接数据库，请先在「连接」中测试通过"
          style={{marginBottom: 12}}
          type="info"
        />
      )}
      <div style={{marginBottom: 12}}>
        <Tag color="blue">目标库：{config.database || '—'}</Tag>
        {diff && stats && (
          <>
            <Tag color="green" icon={<PlusOutlined />}>
              新增 {stats.added}
            </Tag>
            <Tag color="red" icon={<MinusOutlined />}>
              删除 {stats.dropped}
            </Tag>
            <Tag color="orange" icon={<EditOutlined />}>
              修改 {stats.modified}
            </Tag>
          </>
        )}
      </div>

      {!diff && !loading && (
        <Alert
          showIcon
          description="只读操作，不会改动数据库。请人工审阅生成的 SQL 后再选择执行。"
          message="点击「运行对比」从数据库读取现状，与当前设计比较，生成 ALTER 语句。"
          type="info"
        />
      )}

      {loading && (
        <div style={{textAlign: 'center', padding: '40px 0'}}>
          <Spin tip="读取数据库结构并计算差异..." />
        </div>
      )}

      {diff && isEmptyDiff(diff) && (
        <Alert showIcon message="设计与数据库当前结构完全一致，无需变更。" type="success" />
      )}

      {diff && !isEmptyDiff(diff) && (
        <div>
          <DiffSummary diff={diff} />
          <Collapse
            defaultActiveKey={['sql']}
            items={[
              {
                key: 'sql',
                label: <Text strong>ALTER SQL（建议人工审阅后再执行）</Text>,
                children: (
                  <SyntaxHighlighter
                    wrapLongLines
                    customStyle={{
                      margin: 0,
                      borderRadius: 6,
                      maxHeight: 420,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                    language="sql"
                    style={oneDark}
                  >
                    {sql}
                  </SyntaxHighlighter>
                ),
              },
            ]}
            style={{marginTop: 12}}
          />
        </div>
      )}

      {!project && (
        <div style={{marginTop: 12}}>
          <Empty description="尚未加载项目" />
        </div>
      )}
    </Modal>
  )
}

// ==================== 概要展示 ====================

const DiffSummary: React.FC<{diff: SchemaDiff}> = ({diff}) => {
  const sections: {title: string; items: React.ReactNode[]}[] = []

  if (diff.tables.added.length) {
    sections.push({
      title: `新增表（${diff.tables.added.length}）`,
      items: diff.tables.added.map(t => (
        <Tag key={`add-${t.id}`} color="green">{`${t.schema}.${t.name}`}</Tag>
      )),
    })
  }
  if (diff.tables.dropped.length) {
    sections.push({
      title: `删除表（${diff.tables.dropped.length}）`,
      items: diff.tables.dropped.map(t => (
        <Tag key={`drop-${t.schema}.${t.name}`} color="red">{`${t.schema}.${t.name}`}</Tag>
      )),
    })
  }
  if (diff.tables.modified.length) {
    sections.push({
      title: `修改表（${diff.tables.modified.length}）`,
      items: diff.tables.modified.map(m => {
        const parts: string[] = []
        if (m.columnsAdded.length) parts.push(`+${m.columnsAdded.length}列`)
        if (m.columnsDropped.length) parts.push(`-${m.columnsDropped.length}列`)
        if (m.columnsModified.length) parts.push(`~${m.columnsModified.length}列`)
        if (m.fksAdded.length) parts.push(`+${m.fksAdded.length}FK`)
        if (m.fksDropped.length) parts.push(`-${m.fksDropped.length}FK`)
        if (m.indexesAdded.length) parts.push(`+${m.indexesAdded.length}索引`)
        if (m.indexesDropped.length) parts.push(`-${m.indexesDropped.length}索引`)
        if (m.pkChanged) parts.push('PK')
        if (m.commentChanged) parts.push('注释')
        return (
          <Tag key={`mod-${m.schema}.${m.name}`} color="orange">
            {`${m.schema}.${m.name}（${parts.join('，')}）`}
          </Tag>
        )
      }),
    })
  }
  if (diff.enums.added.length) {
    sections.push({
      title: `新增 ENUM（${diff.enums.added.length}）`,
      items: diff.enums.added.map(e => (
        <Tag key={`enum-add-${e.id}`} color="green">{`${e.schema}.${e.name}`}</Tag>
      )),
    })
  }
  if (diff.enums.dropped.length) {
    sections.push({
      title: `删除 ENUM（${diff.enums.dropped.length}）`,
      items: diff.enums.dropped.map(e => (
        <Tag key={`enum-drop-${e.schema}.${e.name}`} color="red">{`${e.schema}.${e.name}`}</Tag>
      )),
    })
  }
  if (diff.enums.valuesAdded.length) {
    sections.push({
      title: `ENUM 新增值（${diff.enums.valuesAdded.length}）`,
      items: diff.enums.valuesAdded.map(e => (
        <Tag key={`enum-val-${e.schema}.${e.name}`} color="orange">
          {`${e.schema}.${e.name} +${e.values.join(',')}`}
        </Tag>
      )),
    })
  }

  return (
    <Space direction="vertical" size={8} style={{width: '100%'}}>
      {sections.map(s => (
        <div key={s.title}>
          <Text strong style={{marginRight: 8}}>
            {s.title}：
          </Text>
          <Space wrap size={[4, 6]}>
            {s.items}
          </Space>
        </div>
      ))}
    </Space>
  )
}

export default SqlDiffModal
