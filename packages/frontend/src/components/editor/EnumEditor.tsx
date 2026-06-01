import React, { useState } from 'react';
import { Modal, Button, Input, Tag, Space, Typography, Empty, Form, Divider, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

const { Text } = Typography;

const EnumEditor: React.FC = () => {
  const { project, addEnum, updateEnum, deleteEnum } = useProjectStore();
  const { enumManagerOpen, setEnumManagerOpen } = useUiStore();
  const [selectedEnumId, setSelectedEnumId] = useState<string | null>(null);
  const [newValueInput, setNewValueInput] = useState('');
  const [addForm] = Form.useForm<{ name: string; schema: string }>();

  const enums = project?.enums ?? [];
  const selectedEnum = enums.find(e => e.id === selectedEnumId) ?? null;

  const handleAddEnum = async () => {
    const values = await addForm.validateFields();
    const id = addEnum({ name: values.name.trim(), schema: values.schema.trim() || 'public', values: [] });
    setSelectedEnumId(id);
    addForm.resetFields();
    addForm.setFieldValue('schema', 'public');
  };

  const handleAddValue = () => {
    const val = newValueInput.trim();
    if (!val || !selectedEnum || selectedEnum.values.includes(val)) return;
    updateEnum(selectedEnum.id, { values: [...selectedEnum.values, val] });
    setNewValueInput('');
  };

  const handleRemoveValue = (val: string) => {
    if (!selectedEnum) return;
    updateEnum(selectedEnum.id, { values: selectedEnum.values.filter(v => v !== val) });
  };

  const handleDeleteEnum = (enumId: string) => {
    deleteEnum(enumId);
    if (selectedEnumId === enumId) setSelectedEnumId(null);
  };

  const handleClose = () => {
    setEnumManagerOpen(false);
    setSelectedEnumId(null);
    setNewValueInput('');
  };

  return (
    <Modal
      title={
        <Space>
          <AppstoreOutlined />
          枚举类型管理
        </Space>
      }
      open={enumManagerOpen}
      onCancel={handleClose}
      footer={<Button onClick={handleClose}>关闭</Button>}
      width={720}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'flex', height: 480 }}>
        {/* 左侧：枚举列表 + 新建表单 */}
        <div style={{ width: 228, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid #f0f0f0' }}>
            <Form form={addForm} initialValues={{ schema: 'public' }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Form.Item
                  name="name"
                  style={{ margin: 0 }}
                  rules={[
                    { required: true, message: '请输入枚举名称' },
                    { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '只能包含字母、数字和下划线' },
                  ]}
                >
                  <Input size="small" placeholder="枚举名称，如 order_status" />
                </Form.Item>
                <Space size={6}>
                  <Form.Item name="schema" style={{ margin: 0 }}>
                    <Input size="small" placeholder="schema" style={{ width: 82 }} />
                  </Form.Item>
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAddEnum}>
                    新建
                  </Button>
                </Space>
              </Space>
            </Form>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {enums.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无枚举类型"
                style={{ marginTop: 40 }}
              />
            ) : (
              enums.map(e => (
                <div
                  key={e.id}
                  onClick={() => { setSelectedEnumId(e.id); setNewValueInput(''); }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: e.id === selectedEnumId ? '#e6f4ff' : 'transparent',
                    borderLeft: e.id === selectedEnumId ? '3px solid #1677ff' : '3px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background 0.12s',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: e.id === selectedEnumId ? 600 : 400,
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {e.schema} · {e.values.length} 个值
                    </Text>
                  </div>
                  <Tooltip title="删除枚举（引用此类型的字段将被重置为 TEXT）">
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={(ev) => { ev.stopPropagation(); handleDeleteEnum(e.id); }}
                    />
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：枚举值编辑器 */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {!selectedEnum ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择左侧枚举类型来编辑值"
              style={{ marginTop: 80 }}
            />
          ) : (
            <>
              <Space style={{ marginBottom: 12 }} wrap>
                <Input
                  value={selectedEnum.name}
                  onChange={e => updateEnum(selectedEnum.id, { name: e.target.value })}
                  style={{ width: 180 }}
                  addonBefore="名称"
                />
                <Input
                  value={selectedEnum.schema}
                  onChange={e => updateEnum(selectedEnum.id, { schema: e.target.value })}
                  style={{ width: 160 }}
                  addonBefore="Schema"
                />
              </Space>
              <Divider style={{ margin: '0 0 12px' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>枚举值</Text>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {selectedEnum.values.map(val => (
                  <Tag
                    key={val}
                    closable
                    onClose={() => handleRemoveValue(val)}
                    style={{ fontSize: 13, padding: '2px 8px' }}
                  >
                    {val}
                  </Tag>
                ))}
                <Input
                  size="small"
                  value={newValueInput}
                  onChange={e => setNewValueInput(e.target.value)}
                  onPressEnter={handleAddValue}
                  placeholder="新增值，按 Enter 确认"
                  style={{ width: 200 }}
                  suffix={
                    <PlusOutlined
                      onClick={handleAddValue}
                      style={{ cursor: 'pointer', color: newValueInput.trim() ? '#1677ff' : '#bbb' }}
                    />
                  }
                />
              </div>
              {selectedEnum.values.length === 0 && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
                  还没有枚举值，在输入框中输入后按 Enter 添加
                </Text>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default EnumEditor;
