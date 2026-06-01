import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Space, Switch, Alert, Tag, Typography, Empty } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { App } from 'antd';
import { useUiStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { useConnectionStore } from '@/store/connectionStore';
import { generateDdlStatements } from '@/utils/sqlGenerator';
import { executeDdl } from '@/api/schema';
import type { ExecuteDdlResponse } from '@/types/api';

const { Text } = Typography;

type RowStatus = 'pending' | 'success' | 'error' | 'rolledback';

const STATUS_META: Record<RowStatus, { color: string; border: string; icon: React.ReactNode }> = {
  pending: { color: '#999', border: '#eee', icon: <MinusCircleOutlined style={{ color: '#bbb' }} /> },
  success: { color: '#52c41a', border: '#52c41a', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> },
  error: { color: '#ff4d4f', border: '#ff4d4f', icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> },
  rolledback: { color: '#faad14', border: '#faad14', icon: <MinusCircleOutlined style={{ color: '#faad14' }} /> },
};

const ExecuteDdlModal: React.FC = () => {
  const { message } = App.useApp();
  const { executeDdlOpen, setExecuteDdlOpen } = useUiStore();
  const { project } = useProjectStore();
  const { config, status } = useConnectionStore();

  const [transactional, setTransactional] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecuteDdlResponse | null>(null);

  const statements = useMemo(
    () => (executeDdlOpen && project ? generateDdlStatements(project) : []),
    [executeDdlOpen, project]
  );

  // 每次打开重置结果
  useEffect(() => {
    if (executeDdlOpen) setResult(null);
  }, [executeDdlOpen]);

  const connected = status === 'connected';
  const errorSet = useMemo(
    () => new Set((result?.errors ?? []).map(e => e.statement)),
    [result]
  );
  const errorMsgByStmt = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of result?.errors ?? []) m.set(e.statement, e.error);
    return m;
  }, [result]);

  const rowStatus = (stmt: string): RowStatus => {
    if (!result) return 'pending';
    if (errorSet.has(stmt)) return 'error';
    // 事务模式下只要有错误，全部回滚
    if (transactional && (result.errors?.length ?? 0) > 0) return 'rolledback';
    return 'success';
  };

  const handleExecute = async () => {
    if (statements.length === 0) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await executeDdl(config, statements, transactional);
      setResult(res);
      if (res.success) {
        message.success(`执行成功，共 ${res.executedCount} 条语句`);
      } else if (transactional) {
        message.error('执行失败，事务已回滚');
      } else {
        message.warning(`部分失败：成功 ${res.executedCount} 条，失败 ${res.errors?.length ?? 0} 条`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '执行失败';
      message.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const renderSummary = () => {
    if (!result) return null;
    const failed = result.errors?.length ?? 0;
    if (result.success) {
      return <Alert type="success" showIcon message={`全部执行成功，共 ${result.executedCount} 条语句`} />;
    }
    if (transactional) {
      return (
        <Alert
          type="error"
          showIcon
          message="执行失败，事务已回滚，数据库未发生变更"
          description={`首个失败语句的错误见下方高亮行（共 ${failed} 条错误）`}
        />
      );
    }
    return (
      <Alert
        type="warning"
        showIcon
        message={`部分执行：成功 ${result.executedCount} 条，失败 ${failed} 条`}
        description="逐条模式下成功的语句已生效，失败的语句见下方高亮行"
      />
    );
  };

  return (
    <Modal
      title="执行 DDL 到数据库"
      open={executeDdlOpen}
      onCancel={() => setExecuteDdlOpen(false)}
      width={760}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Switch
              checked={transactional}
              onChange={setTransactional}
              disabled={running}
            />
            <Text>事务模式（出错时整体回滚）</Text>
          </Space>
          <Space>
            <Button onClick={() => setExecuteDdlOpen(false)}>关闭</Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={running}
              onClick={handleExecute}
              disabled={!connected || statements.length === 0}
            >
              执行（{statements.length} 条）
            </Button>
          </Space>
        </div>
      }
    >
      {!connected && (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="尚未连接数据库，请先在「连接」中测试通过"
        />
      )}

      <div style={{ marginBottom: 12 }}>
        <Tag color="blue">目标库：{config.database || '—'}</Tag>
      </div>

      {renderSummary() && <div style={{ marginBottom: 12 }}>{renderSummary()}</div>}

      {statements.length === 0 ? (
        <Empty description="没有可执行的 DDL（请先设计表）" />
      ) : (
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {statements.map((stmt, i) => {
            const st = rowStatus(stmt);
            const meta = STATUS_META[st];
            const err = errorMsgByStmt.get(stmt);
            return (
              <div
                key={i}
                style={{
                  borderLeft: `3px solid ${meta.border}`,
                  background: st === 'error' ? '#fff1f0' : st === 'success' ? '#f6ffed' : '#fafafa',
                  padding: '6px 10px',
                  marginBottom: 6,
                  borderRadius: 4,
                }}
              >
                <Space align="start" size={8}>
                  <span style={{ marginTop: 2 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 12.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                      }}
                    >
                      {stmt}
                    </pre>
                    {err && (
                      <Text type="danger" style={{ fontSize: 12 }}>
                        ✗ {err}
                      </Text>
                    )}
                  </div>
                </Space>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

export default ExecuteDdlModal;
