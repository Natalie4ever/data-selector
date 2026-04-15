import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Space, Select, Card, Typography, Collapse, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined, DatabaseOutlined, ApiOutlined } from '@ant-design/icons';
import { listDatasources, testDatasource } from '../api.js';

const { Text } = Typography;
const { Panel } = Collapse;

const PARAM_TYPES = [
  { label: '文本', value: 'text' },
  { label: '日期', value: 'date' },
  { label: '数字', value: 'number' },
];

const AGG_OPTIONS = [
  { label: 'SUM（求和）', value: 'SUM' },
  { label: 'AVG（均值）', value: 'AVG' },
  { label: 'COUNT（计数）', value: 'COUNT' },
  { label: 'MAX（最大值）', value: 'MAX' },
  { label: 'MIN（最小值）', value: 'MIN' },
  { label: '不聚合（取首值）', value: '不聚合' },
  { label: '表达式（自定义聚合）', value: 'expression' },
];

// 数据库类型标签颜色
const DB_TYPE_COLORS = {
  sqlite: 'green',
  mysql: 'blue',
  postgres: 'purple',
  oracle: 'orange',
  sqlserver: 'cyan',
};

// 从 SQL 脚本中提取列别名
function parseColumnAliases(sql) {
  if (!sql) return [];
  const aliases = [];
  const regex = /AS\s+["`]?([^",\r\n]+?)["`]?\s*(?:,|$|FROM|GROUP|ORDER|WHERE|HAVING|LIMIT)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const alias = match[1].trim();
    if (alias) {
      aliases.push(alias);
    }
  }
  return aliases;
}

// 检测是否为计算列
function detectComputedColumns(sql, aliases) {
  if (!sql || !aliases.length) return {};
  const computed = {};
  const exprOnly = sql.replace(/\bAS\s+["`]?[\w\u4e00-\u9fa5]+["`]?\s*[,)]?/gi, '');
  for (const alias of aliases) {
    const pattern = new RegExp(`=\\s*[^=]*\\b${alias}\\b[^=]*$`, 'i');
    if (pattern.test(exprOnly)) {
      computed[alias] = true;
    }
  }
  return computed;
}

// 从 SQL 中尝试解析某列的默认表达式
function extractDefaultExpr(sql, alias) {
  if (!sql || !alias) return '';
  const regex = new RegExp(`\\b${alias}\\b\\s*=\\s*(.+?)(?:\\s+AS|\\s*,|\\s*FROM|$)`, 'i');
  const match = sql.match(regex);
  if (match) {
    let expr = match[1].trim();
    expr = expr.replace(/^["'`]|["'`]$/g, '').trim();
    return expr;
  }
  return '';
}

// 生成聚合表达式预览
function buildAggPreview(config) {
  if (config.agg_type === 'expression' && config.agg_expr) {
    return config.agg_expr;
  }
  if (config.agg_type === '不聚合') return '不聚合（取首值）';
  return `${config.agg_type}(${config.name})`;
}

export default function QueryFormModal({ open, onClose, onSave, initialData }) {
  const [form] = Form.useForm();
  const [parameters, setParameters] = useState([]);
  const [columnConfig, setColumnConfig] = useState([]);
  const [sqlText, setSqlText] = useState('');
  const [expandedPanels, setExpandedPanels] = useState(['columns']);

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
      });
      setParameters(initialData.parameters || []);
      setColumnConfig(initialData.column_config || []);
      setSqlText(initialData.sql_text || '');
      setSelectedDatasource(initialData.datasource_id || 'DS_DEFAULT');
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({ datasource_id: 'DS_DEFAULT' });
      setParameters([]);
      setColumnConfig([]);
      setSqlText('');
      setSelectedDatasource('DS_DEFAULT');
    }
  }, [open, initialData, form]);

  // 当 SQL 变化时，自动解析列并初始化配置
  const handleSqlChange = (value) => {
    setSqlText(value);
    const aliases = parseColumnAliases(value);
    const computed = detectComputedColumns(value, aliases);

    const existingNames = new Set(columnConfig.map(c => c.name));
    const newConfigs = aliases
      .filter(name => !existingNames.has(name))
      .map(name => ({
        name,
        agg_type: computed[name] ? 'SUM' : 'SUM',
        agg_expr: computed[name] ? extractDefaultExpr(value, name) : '',
      }));

    if (newConfigs.length > 0) {
      setColumnConfig(prev => [...prev, ...newConfigs]);
    }
  };

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

  const handleAggTypeChange = (name, aggType) => {
    setColumnConfig(prev =>
      prev.map(c => c.name === name ? { ...c, agg_type: aggType } : c)
    );
  };

  const handleAggExprChange = (name, aggExpr) => {
    setColumnConfig(prev =>
      prev.map(c => c.name === name ? { ...c, agg_expr: aggExpr } : c)
    );
  };

  const handleDatasourceChange = (value) => {
    setSelectedDatasource(value);
    form.setFieldsValue({ datasource_id: value });  // 同步到 Form 内部
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
      console.log('[DEBUG] handleSubmit values:', values);
      console.log('[DEBUG] datasource_id from form:', values.datasource_id);
      onSave({
        display_name: values.display_name,
        sql_text: values.sql_text,
        datasource_id: values.datasource_id === 'DS_DEFAULT' ? null : values.datasource_id,
        parameters,
        column_config: columnConfig.filter(c => c.agg_type !== 'SUM' || c.name),
      });
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const computedNames = new Set(
    sqlText
      ? parseColumnAliases(sqlText).filter(alias =>
          new RegExp(`\\b${alias}\\b\\s*=\\s*[^=]+[+\-*/][^=]*$`, 'i').test(
            sqlText.replace(/\bAS\s+["`]?[\w\u4e00-\u9fa5]+["`]?\s*[,)]?/gi, '')
          )
        )
      : []
  );

  return (
    <Modal
      title={initialData ? '编辑查询' : '新增查询'}
      open={open}
      onCancel={onClose}
      width={850}
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
        <Form.Item
          name="datasource_id"
          label="数据源"
          initialValue="DS_DEFAULT"
        >
          <Space style={{ width: '100%' }}>
            <Select
              style={{ width: 320 }}
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
            <Button
              onClick={handleTestConnection}
              loading={testingConnection}
              disabled={selectedDatasource === 'DS_DEFAULT'}
            >
              测试连接
            </Button>
          </Space>
        </Form.Item>

        {/* SQL 脚本 */}
        <Form.Item
          name="sql_text"
          label="SQL 脚本"
          rules={[{ required: true, message: '请输入 SQL 脚本' }]}
          extra={
            <Text type="secondary">
              使用 <code>:参数名</code> 定义参数，如 <code>:p_date</code>。
              计算列（如 C = A / B）请在下方配置聚合方式。
            </Text>
          }
        >
          <Input.TextArea
            rows={6}
            placeholder="SELECT order_date, SUM(amount) AS total_amount, COUNT(id) AS order_count FROM orders GROUP BY order_date"
            onChange={(e) => handleSqlChange(e.target.value)}
          />
        </Form.Item>

        {/* 列聚合配置 */}
        {columnConfig.length > 0 && (
          <Collapse
            activeKey={expandedPanels}
            onChange={(keys) => setExpandedPanels(keys)}
            style={{ marginBottom: 16 }}
          >
            <Panel
              header={
                <Space>
                  <SettingOutlined />
                  <Text strong>列聚合配置</Text>
                  <Text type="secondary" style={{ fontWeight: 400 }}>
                    （按时间维度聚合时生效）
                  </Text>
                </Space>
              }
              key="columns"
            >
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当选择「日/周/月」聚合时，系统会根据以下配置对各列进行聚合。计算列（如 C = A/B）建议选择「表达式」，其余列通常选择 SUM。
                </Text>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0', width: 140 }}>列名</th>
                    <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>聚合方式</th>
                    <th style={{ padding: '8px 8px', textAlign: 'left', borderBottom: '1px solid #f0f0f0', width: 220 }}>表达式（expression 模式）</th>
                  </tr>
                </thead>
                <tbody>
                  {columnConfig.map((config) => {
                    const isComputed = computedNames.has(config.name);
                    return (
                      <tr key={config.name}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #f0f0f0' }}>
                          <Space>
                            <Text>{config.name}</Text>
                            {isComputed && (
                              <Tooltip title="检测为计算列，建议选择「表达式」并配置聚合规则">
                                <Tag color="orange" style={{ margin: 0 }}>计算列</Tag>
                              </Tooltip>
                            )}
                          </Space>
                        </td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #f0f0f0' }}>
                          <Select
                            value={config.agg_type}
                            onChange={(val) => handleAggTypeChange(config.name, val)}
                            options={AGG_OPTIONS}
                            style={{ width: 180 }}
                            size="small"
                          />
                        </td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #f0f0f0' }}>
                          {config.agg_type === 'expression' ? (
                            <Input
                              size="small"
                              placeholder="SUM(a)/SUM(b)"
                              value={config.agg_expr || ''}
                              onChange={(e) => handleAggExprChange(config.name, e.target.value)}
                            />
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              预览：{buildAggPreview(config)}
                            </Text>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Collapse>
        )}

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
