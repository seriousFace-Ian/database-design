import React from 'react';
import { Modal, Button, Space, message, Empty } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';

const SqlPreviewModal: React.FC = () => {
  const { sqlPreviewOpen, setSqlPreviewOpen } = useUiStore();
  const { project } = useProjectStore();

  // SQL 生成在 Phase 3 实现，此处占位
  const sql = project
    ? `-- SQL 生成功能将在 Phase 3 实现\n-- 项目: ${project.name}\n-- 表数量: ${project.tables.length}`
    : '';

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
          <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!sql}>
            复制
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!sql}>
            下载 .sql
          </Button>
          <Button type="primary" onClick={() => setSqlPreviewOpen(false)}>
            关闭
          </Button>
        </Space>
      }
    >
      {sql ? (
        <pre
          style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 16,
            borderRadius: 6,
            maxHeight: 480,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {sql}
        </pre>
      ) : (
        <Empty description="暂无可预览的 SQL" />
      )}
    </Modal>
  );
};

export default SqlPreviewModal;
