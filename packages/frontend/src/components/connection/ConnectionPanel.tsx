import React from 'react';
import {
  Modal, Form, Input, InputNumber, Switch, Button, Space, Tag, Typography
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useUiStore } from '@/store/uiStore';
import { useConnectionStore } from '@/store/connectionStore';
import { testConnection } from '@/api/connection';

const { Text } = Typography;

const ConnectionPanel: React.FC = () => {
  const { connectionPanelOpen, setConnectionPanelOpen } = useUiStore();
  const { config, status, pgVersion, errorMessage, setConfig, setStatus } = useConnectionStore();

  const handleTest = async () => {
    setStatus('testing');
    try {
      const res = await testConnection(config);
      if (res.success) {
        setStatus('connected', { version: res.version });
      } else {
        setStatus('error', { error: res.error });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '连接失败';
      setStatus('error', { error: msg });
    }
  };

  const statusTag = {
    idle: null,
    testing: <Tag icon={<LoadingOutlined />} color="processing">连接中...</Tag>,
    connected: <Tag icon={<CheckCircleOutlined />} color="success">已连接</Tag>,
    error: <Tag icon={<CloseCircleOutlined />} color="error">连接失败</Tag>,
  }[status];

  return (
    <Modal
      title="数据库连接配置"
      open={connectionPanelOpen}
      onCancel={() => setConnectionPanelOpen(false)}
      footer={
        <Space>
          <Button onClick={handleTest} loading={status === 'testing'}>
            测试连接
          </Button>
          <Button type="primary" onClick={() => setConnectionPanelOpen(false)}>
            确定
          </Button>
        </Space>
      }
      width={480}
    >
      <Form layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item label="主机">
          <Input value={config.host} onChange={e => setConfig({ host: e.target.value })} placeholder="localhost" />
        </Form.Item>
        <Space style={{ width: '100%' }} size={12}>
          <Form.Item label="端口" style={{ flex: 1 }}>
            <InputNumber
              value={config.port}
              onChange={v => setConfig({ port: v ?? 5432 })}
              min={1}
              max={65535}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="数据库名" style={{ flex: 2 }}>
            <Input value={config.database} onChange={e => setConfig({ database: e.target.value })} />
          </Form.Item>
        </Space>
        <Form.Item label="用户名">
          <Input value={config.username} onChange={e => setConfig({ username: e.target.value })} />
        </Form.Item>
        <Form.Item label="密码">
          <Input.Password value={config.password} onChange={e => setConfig({ password: e.target.value })} />
        </Form.Item>
        <Form.Item label="启用 SSL">
          <Switch checked={config.ssl} onChange={ssl => setConfig({ ssl })} />
        </Form.Item>
      </Form>

      {statusTag && (
        <div style={{ marginTop: 8 }}>
          {statusTag}
          {status === 'connected' && pgVersion && (
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{pgVersion}</Text>
          )}
          {status === 'error' && errorMessage && (
            <Text type="danger" style={{ marginLeft: 8, fontSize: 12 }}>{errorMessage}</Text>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ConnectionPanel;
