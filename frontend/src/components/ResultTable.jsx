import React, { useMemo } from 'react';
import { Table, Empty, Card } from 'antd';

export default function ResultTable({ columns, rows, filters }) {
  const filteredRows = useMemo(() => {
    if (!rows || !filters) return rows;
    return rows.filter(row => {
      for (const [col, value] of Object.entries(filters)) {
        if (value != null && String(row[col]) !== String(value)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filters]);

  if (!columns || columns.length === 0) {
    return (
      <Card>
        <Empty description="暂无数据，请配置并执行查询" />
      </Card>
    );
  }

  const tableColumns = columns.map(col => ({
    title: col,
    dataIndex: col,
    key: col,
    width: 150,
    ellipsis: true,
  }));

  return (
    <Card>
      <Table
        columns={tableColumns}
        dataSource={filteredRows}
        rowKey={(_, index) => index}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 'max-content' }}
        size="small"
      />
    </Card>
  );
}
