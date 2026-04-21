import React, { useState, useEffect } from 'react';
import {
  Modal, Table, DatePicker, Select, Space, Button, Tag,
  Drawer, Spin, Empty, message
} from 'antd';
import dayjs from 'dayjs';
import * as api from '../api';

const { RangePicker } = DatePicker;

const ACTION_MAP = {
  LOGIN: '登录',
  LOGOUT: '登出',
  QUERY_CREATE: '创建查询',
  QUERY_UPDATE: '修改查询',
  QUERY_DELETE: '删除查询',
  QUERY_EXECUTE: '执行查询',
  DATASOURCE_TEST: '测试数据源',
};

const ACTION_COLORS = {
  LOGIN: 'green',
  LOGOUT: 'orange',
  QUERY_CREATE: 'blue',
  QUERY_UPDATE: 'cyan',
  QUERY_DELETE: 'red',
  QUERY_EXECUTE: 'purple',
  DATASOURCE_TEST: 'default',
};

export default function AuditLogModal({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [action, setAction] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState(null);

  const loadLogs = async (currentPage = page, currentPageSize = pageSize) => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        page_size: currentPageSize,
        action,
      };
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }
      const data = await api.getAuditLogs(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(data.page || currentPage);
      setPageSize(data.page_size || currentPageSize);
    } catch (error) {
      message.error(error.message || '加载审计日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadLogs(1, pageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action, dateRange]);

  const handleTableChange = (pagination) => {
    loadLogs(pagination.current, pagination.pageSize);
  };

  const showDetail = (record) => {
    setDetailLog(record);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      width: 120,
      render: (v) => (
        <Tag color={ACTION_COLORS[v] || 'default'}>
          {ACTION_MAP[v] || v}
        </Tag>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'ehr_no',
      width: 110,
      render: (v) => v || '-',
    },
    {
      title: '对象类型',
      dataIndex: 'target_type',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '对象ID',
      dataIndex: 'target_id',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v) => (
        <Tag color={v === 'success' ? 'success' : 'error'}>
          {v === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => showDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="操作日志"
        open={open}
        onCancel={onClose}
        width={1100}
        footer={[
          <Button key="close" onClick={onClose}>关闭</Button>,
        ]}
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="操作类型"
            allowClear
            style={{ width: 140 }}
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
          >
            {Object.entries(ACTION_MAP).map(([k, label]) => (
              <Select.Option key={k} value={k}>{label}</Select.Option>
            ))}
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(v) => { setDateRange(v); setPage(1); }}
            placeholder={['开始日期', '结束日期']}
          />
          <Button type="primary" onClick={() => loadLogs(1, pageSize)}>
            刷新
          </Button>
        </Space>

        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : logs.length === 0 ? (
          <Empty description="暂无日志" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={logs}
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
            }}
            onChange={handleTableChange}
            size="small"
            scroll={{ x: 800, y: 420 }}
          />
        )}
      </Modal>

      <Drawer
        title="日志详情"
        placement="right"
        width={520}
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
      >
        {detailLog ? (
          <div style={{ fontSize: 13 }}>
            <p><b>ID:</b> {detailLog.id}</p>
            <p><b>时间:</b> {dayjs(detailLog.created_at).format('YYYY-MM-DD HH:mm:ss')}</p>
            <p><b>操作人:</b> {detailLog.ehr_no || '-'}</p>
            <p><b>操作类型:</b> {ACTION_MAP[detailLog.action] || detailLog.action}</p>
            <p><b>对象类型:</b> {detailLog.target_type || '-'}</p>
            <p><b>对象ID:</b> {detailLog.target_id || '-'}</p>
            <p>
              <b>状态:</b>{' '}
              <Tag color={detailLog.status === 'success' ? 'success' : 'error'}>
                {detailLog.status === 'success' ? '成功' : '失败'}
              </Tag>
            </p>
            {detailLog.error_message && (
              <p style={{ color: '#cf1322' }}>
                <b>错误信息:</b> {detailLog.error_message}
              </p>
            )}
            <p><b>IP 地址:</b> {detailLog.ip_address || '-'}</p>
            <p><b>User-Agent:</b> {detailLog.user_agent || '-'}</p>

            <div style={{ marginTop: 16 }}>
              <b>详情 (detail):</b>
              <pre
                style={{
                  background: '#f6ffed',
                  padding: 12,
                  borderRadius: 4,
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                {JSON.stringify(detailLog.detail, null, 2)}
              </pre>
            </div>

            {detailLog.before_value && (
              <div style={{ marginTop: 16 }}>
                <b>修改前内容 (before_value):</b>
                <pre
                  style={{
                    background: '#fff2f0',
                    padding: 12,
                    borderRadius: 4,
                    overflow: 'auto',
                    maxHeight: 300,
                  }}
                >
                  {JSON.stringify(detailLog.before_value, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
