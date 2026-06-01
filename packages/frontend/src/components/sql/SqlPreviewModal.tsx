import React, { useMemo } from 'react';
import { Modal, Button, Space, message, Empty } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { generateProjectDdl } from '@/utils/sqlGenerator';

const SqlPreviewModal: React.FC = () => {
  const { sqlPreviewOpen, setSqlPreviewOpen } = useUiStore();
  const { project } = useProjectStore();

  // 仅在弹窗打开且有项目时生成，避免不必要的计算
  const sql = useMemo(
    () => (sqlPreviewOpen && project ? generateProjectDdl(project) : ''),
    [sqlPreviewOpen, project]
  );

  const hasContent = !!project && project.tables.length > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(sql).then(() => message.success('已复制到剪贴板'));
  };

  const handleDownload = () => {
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name ?? 'schema'}.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      title="SQL 预览"
      open={sqlPreviewOpen}
      onCancel={() => setSqlPreviewOpen(false)}
      width={800}
      footer={
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!hasContent}>
            复制
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!hasContent}>
            下载 .sql
          </Button>
          <Button type="primary" onClick={() => setSqlPreviewOpen(false)}>
            关闭
          </Button>
        </Space>
      }
    >
      {hasContent ? (
        <SyntaxHighlighter
          language="sql"
          style={oneDark}
          customStyle={{
            margin: 0,
            borderRadius: 6,
            maxHeight: 480,
            fontSize: 13,
            lineHeight: 1.6,
          }}
          wrapLongLines
        >
          {sql}
        </SyntaxHighlighter>
      ) : (
        <Empty description="还没有可生成 SQL 的表" />
      )}
    </Modal>
  );
};

export default SqlPreviewModal;
