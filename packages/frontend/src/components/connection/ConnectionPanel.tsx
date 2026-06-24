import {CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined} from '@ant-design/icons'
import {Button, Form, Input, InputNumber, Modal, Space, Switch, Tag, Typography} from 'antd'
import type React from 'react'

import {testConnection} from '@/api/connection'
import {useConnectionStore} from '@/store/connectionStore'
import {useUiStore} from '@/store/uiStore'

const {Text} = Typography

const ConnectionPanel: React.FC = () => {
  const {connectionPanelOpen, setConnectionPanelOpen} = useUiStore()
  const {config, status, pgVersion, errorMessage, setConfig, setStatus} = useConnectionStore()

  const handleTest = async () => {
    setStatus('testing')
    try {
      const res = await testConnection(config)
      if (res.success) {
        setStatus('connected', {version: res.version})
      } else {
        setStatus('error', {error: res.error})
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '连接失败'
      setStatus('error', {error: msg})
    }
  }

  const statusTag = {
    idle: null,
    testing: (
      <Tag color="processing" icon={<LoadingOutlined />}>
        连接中...
      </Tag>
    ),
    connected: (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        已连接
      </Tag>
    ),
    error: (
      <Tag color="error" icon={<CloseCircleOutlined />}>
        连接失败
      </Tag>
    ),
  }[status]

  return (
    <Modal
      footer={
        <Space>
          <Button loading={status === 'testing'} onClick={handleTest}>
            测试连接
          </Button>
          <Button type="primary" onClick={() => setConnectionPanelOpen(false)}>
            确定
          </Button>
        </Space>
      }
      open={connectionPanelOpen}
      title="数据库连接配置"
      width={480}
      onCancel={() => setConnectionPanelOpen(false)}
    >
      <Form layout="vertical" style={{marginTop: 8}}>
        <Form.Item label="主机">
          <Input
            placeholder="localhost"
            value={config.host}
            onChange={e => setConfig({host: e.target.value})}
          />
        </Form.Item>
        <Space size={12} style={{width: '100%'}}>
          <Form.Item label="端口" style={{flex: 1}}>
            <InputNumber
              max={65535}
              min={1}
              style={{width: '100%'}}
              value={config.port}
              onChange={v => setConfig({port: v ?? 5432})}
            />
          </Form.Item>
          <Form.Item label="数据库名" style={{flex: 2}}>
            <Input value={config.database} onChange={e => setConfig({database: e.target.value})} />
          </Form.Item>
        </Space>
        <Form.Item label="用户名">
          <Input value={config.username} onChange={e => setConfig({username: e.target.value})} />
        </Form.Item>
        <Form.Item label="密码">
          <Input.Password
            value={config.password}
            onChange={e => setConfig({password: e.target.value})}
          />
        </Form.Item>
        <Form.Item label="启用 SSL">
          <Switch checked={config.ssl} onChange={ssl => setConfig({ssl})} />
        </Form.Item>
      </Form>

      {statusTag && (
        <div style={{marginTop: 8}}>
          {statusTag}
          {status === 'connected' && pgVersion && (
            <Text style={{marginLeft: 8, fontSize: 12}} type="secondary">
              {pgVersion}
            </Text>
          )}
          {status === 'error' && errorMessage && (
            <Text style={{marginLeft: 8, fontSize: 12}} type="danger">
              {errorMessage}
            </Text>
          )}
        </div>
      )}
    </Modal>
  )
}

export default ConnectionPanel
