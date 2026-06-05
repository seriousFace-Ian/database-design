import React, { useState } from 'react';
import {
  Button,
  Input,
  Space,
  Typography,
  Tooltip,
  Empty,
  Modal,
  Form,
  theme,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  TableOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import TableListItem from './TableListItem';

const { Text } = Typography;

const Sidebar: React.FC = () => {
  const { project, addTable } = useProjectStore();
  const { selectedTableId, selectTable, setEnumManagerOpen } = useUiStore();
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();

  const tables = project?.tables ?? [];
  const filtered = search
    ? tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables;

  const handleAdd = async () => {
    const values = await form.validateFields();
    const id = addTable(values.name.trim());
    selectTable(id);
    setAddModalOpen(false);
    form.resetFields();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13 }}>
            <TableOutlined style={{ marginRight: 6, color: '#1677ff' }} />
            数据表
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
              ({tables.length})
            </Text>
          </Text>
          <Space size={4}>
            <Tooltip title="枚举类型管理">
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => setEnumManagerOpen(true)}
                disabled={!project}
              />
            </Tooltip>
            <Tooltip title="新建表">
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddModalOpen(true)}
                disabled={!project}
              />
            </Tooltip>
          </Space>
        </div>
        <Input
          size="small"
          placeholder="搜索表名..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          disabled={!project}
        />
      </div>

      {/* 表列表 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {!project ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请新建或打开项目"
            style={{ marginTop: 40 }}
          />
        ) : filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={search ? '未找到匹配的表' : '点击 + 新建第一张表'}
            style={{ marginTop: 40 }}
          />
        ) : (
          filtered.map(table => (
            <TableListItem
              key={table.id}
              table={table}
              isSelected={table.id === selectedTableId}
              onSelect={() => selectTable(table.id)}
            />
          ))
        )}
      </div>

      {/* 新建表弹窗 */}
      <Modal
        title="新建数据表"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
        width={360}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="表名"
            rules={[
              { required: true, message: '请输入表名' },
              { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '表名只能包含字母、数字和下划线，且不能以数字开头' },
            ]}
          >
            <Input placeholder="例如：users" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Sidebar;
