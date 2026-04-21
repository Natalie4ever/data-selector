import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Space, Select, Card, Typography, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined, DatabaseOutlined, ApiOutlined, FolderOutlined } from '@ant-design/icons';
import { listDatasources, testDatasource } from '../api.js';

const { Text } = Typography;

const PARAM_TYPES = [
  { label: '文本', value: 'text' },
  { label: '日期', value: 'date' },
  { label: '数字', value: 'number' },
];

// 数据库类型标签颜色
const DB_TYPE_COLORS = {
  sqlite: 'green',
  mysql: 'blue',
  postgres: 'purple',
  oracle: 'orange',
  sqlserver: 'cyan',
};

export default function QueryFormModal({
  open,
  onClose,
  onSave,
  initialData,
  menuTree = [],
  isAdmin = false,
}) {
  const [form] = Form.useForm();
  const [parameters, setParameters] = useState([]);
  const [sqlText, setSqlText] = useState('');

  // 数据源相关状态
  const [datasources, setDatasources] = useState([]);
  const [selectedDatasource, setSelectedDatasource] = useState('DS_DEFAULT');
  const [testingConnection, setTestingConnection] = useState(false);

  // 加载数据源列表
  useEffect(() => {
    if (open) {
      listDatasources()
        .then(data => {
          setDatasources(data);
        })
        .catch(err => {
          message.error('加载数据源失败: ' + err.message);
        });
    }
  }, [open]);

  useEffect(() => {
    if (open && initialData) {
      form.setFieldsValue({
        display_name: initialData.display_name,
        sql_text: initialData.sql_text,
        datasource_id: initialData.datasource_id || 'DS_DEFAULT',
        menu_item_id: initialData.menu_item_id ?? undefined,
      });
      setParameters(initialData.parameters || []);
      setSqlText(initialData.sql_text || '');
      setSelectedDatasource(initialData.datasource_id || 'DS_DEFAULT');
    } else if (open) {
      form.resetFields();
      // 新增查询时，默认使用当前选中的菜单
      const defaultMenuItemId = initialData?.menu_item_id ?? undefined;
      form.setFieldsValue({
        datasource_id: 'DS_DEFAULT',
        menu_item_id: defaultMenuItemId,
      });
      setParameters([]);
      setSqlText('');
      setSelectedDatasource('DS_DEFAULT');
    }
  }, [open, initialData, form]);

  // 数据源列表加载完成后，重新设置 datasource_id，确保 Select 能正确匹配已存在的 Option
  useEffect(() => {
    if (open && initialData && datasources.length > 0) {
      form.setFieldsValue({
        datasource_id: initialData.datasource_id || 'DS_DEFAULT',
      });
    }
  }, [open, initialData, datasources, form]);

  const handleAddParam = () => {
    setParameters([...parameters, { name: '', label: '', type: 'text' }]);
  };

  const handleRemoveParam = (index) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleParamChange = (index, field, value) => {
    const newParams = [...parameters];
    newParams[index][field] = value;
    setParameters(newParams);
  };

  const handleDatasourceChange = (value) => {
    setSelectedDatasource(value);
    form.setFieldsValue({ datasource_id: value });
  };

  const handleTestConnection = async () => {
    if (selectedDatasource === 'DS_DEFAULT') {
      message.info('内置数据库无需测试连接');
      return;
    }
    setTestingConnection(true);
    try {
      const result = await testDatasource(selectedDatasource);
      if (result.success) {
        message.success('连接测试成功');
      } else {
        message.error('连接测试失败: ' + result.message);
      }
    } catch (err) {
      message.error('连接测试失败: ' + err.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSave({
        display_name: values.display_name,
        sql_text: values.sql_text,
        datasource_id: values.datasource_id === 'DS_DEFAULT' ? null : values.datasource_id,
        parameters,
        menu_item_id: values.menu_item_id || null,
      });
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  return (
    <Modal
      title={initialData ? '编辑查询' : '新增查询'}
      open={open}
      onCancel={onClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          保存
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        {/* 显示名称 */}
        <Form.Item
          name="display_name"
          label="显示名称"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="例如：交易明细表" />
        </Form.Item>

        {/* 数据源选择 */}
        <Form.Item label="数据源">
          <Space>
            <Form.Item
              name="datasource_id"
              noStyle
              initialValue="DS_DEFAULT"
            >
              <Select
                style={{ width: 280 }}
                onChange={handleDatasourceChange}
                placeholder="选择数据源"
              >
                <Select.Option value="DS_DEFAULT">
                  <Space>
                    <DatabaseOutlined />
                    <span>内置数据库 (SQLite)</span>
                  </Space>
                </Select.Option>
                {datasources.map(ds => (
                  <Select.Option key={ds.id} value={ds.id}>
                    <Space>
                      <ApiOutlined />
                      <span>{ds.name}</span>
                      <Tag color={DB_TYPE_COLORS[ds.db_type] || 'default'}>
                        {ds.db_type.toUpperCase()}
                      </Tag>
                      {ds.host && <Text type="secondary" style={{ fontSize: 12 }}>
                        ({ds.host}{ds.port ? `:${ds.port}` : ''})
                      </Text>}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Button
              onClick={handleTestConnection}
              loading={testingConnection}
              disabled={selectedDatasource === 'DS_DEFAULT'}
            >
              测试连接
            </Button>
          </Space>
        </Form.Item>

        {/* 所属菜单（仅管理员可见） */}
        {isAdmin && (
          <Form.Item name="menu_item_id" label="所属菜单">
            <Select
              placeholder="选择所属二级菜单（可选）"
              allowClear
              showSearch
              filterOption={(input, option) =>
                option.searchLabel?.toLowerCase().includes(input.toLowerCase())
              }
            >
              <Select.Option key="uncategorized" value={undefined}>
                未分类
              </Select.Option>
              {menuTree.map(cat => (
                <Select.OptGroup key={cat.id} label={cat.name}>
                  {cat.items.map(item => (
                    <Select.Option
                      key={item.id}
                      value={item.id}
                      searchLabel={`${cat.name} / ${item.name}`}
                    >
                      <Space>
                        <FolderOutlined style={{ color: '#aaa', fontSize: 12 }} />
                        <span>{cat.name} / {item.name}</span>
                      </Space>
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              ))}
            </Select>
          </Form.Item>
        )}

        {/* SQL 脚本 */}
        <Form.Item
          name="sql_text"
          label="SQL 脚本"
          rules={[{ required: true, message: '请输入 SQL 脚本' }]}
          extra={
            <Text type="secondary">
              使用 <code>:参数名</code> 定义参数，如 <code>:p_date</code>。
            </Text>
          }
        >
          <Input.TextArea
            rows={6}
            placeholder="SELECT order_date, SUM(amount) AS total_amount, COUNT(id) AS order_count FROM orders GROUP BY order_date"
            onChange={(e) => setSqlText(e.target.value)}
          />
        </Form.Item>

        {/* 参数定义 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            <Space>
              <Text strong>参数定义</Text>
              <Text type="secondary" style={{ fontWeight: 400 }}>（使用 :参数名 在 SQL 中引用）</Text>
            </Space>
          </div>
          {parameters.map((param, index) => (
            <Card key={index} size="small" style={{ marginBottom: 8 }}>
              <Space>
                <Input
                  placeholder="参数名"
                  value={param.name}
                  onChange={(e) => handleParamChange(index, 'name', e.target.value)}
                  style={{ width: 120 }}
                />
                <Input
                  placeholder="显示名称"
                  value={param.label}
                  onChange={(e) => handleParamChange(index, 'label', e.target.value)}
                  style={{ width: 120 }}
                />
                <Select
                  value={param.type}
                  onChange={(value) => handleParamChange(index, 'type', value)}
                  options={PARAM_TYPES}
                  style={{ width: 100 }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveParam(index)}
                />
              </Space>
            </Card>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddParam}
            style={{ width: '100%' }}
          >
            添加参数
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
