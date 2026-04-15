import React, { useState, useEffect, useMemo } from 'react';
import { Space, Select, Typography, Button } from 'antd';
import { FilterOutlined, ReloadOutlined, CloudDownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

const GROUP_OPTIONS = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
];

export default function FilterBar({ columns, rows, onChange, dateColumnChanged, onExecute, onExport, loading }) {
  const [filters, setFilters] = useState({});
  const [dateColumn, setDateColumn] = useState(null);
  const [groupBy, setGroupBy] = useState('day');

  const possibleDateColumns = useMemo(() => {
    if (!columns || !rows[0]) return [];
    return columns.filter(col => {
      const nameLower = col.toLowerCase();
      if (nameLower.includes('date') || nameLower.includes('time') ||
          nameLower.includes('日') || nameLower.includes('时间') ||
          nameLower.includes('期')) {
        return true;
      }
      if (rows[0] && typeof rows[0][col] === 'string') {
        const val = rows[0][col];
        if (/^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{4}\/\d{2}\/\d{2}/.test(val)) {
          return true;
        }
      }
      return false;
    });
  }, [columns, rows]);

  useEffect(() => {
    if (possibleDateColumns.length > 0 && !dateColumn) {
      setDateColumn(possibleDateColumns[0]);
      dateColumnChanged(possibleDateColumns[0], groupBy);
    }
  }, [possibleDateColumns, dateColumn, groupBy, dateColumnChanged]);

  const handleFilterChange = (col, value) => {
    const newFilters = { ...filters, [col]: value };
    setFilters(newFilters);
    onChange(newFilters, { dateColumn, groupBy });
  };

  const handleDateColumnChange = (value) => {
    setDateColumn(value);
    dateColumnChanged(value, groupBy);
  };

  const handleGroupByChange = (value) => {
    setGroupBy(value);
    dateColumnChanged(dateColumn, value);
  };

  const handleReset = () => {
    setFilters({});
    onChange({}, { dateColumn, groupBy });
  };

  const getDistinctValues = (col) => {
    if (!rows) return [];
    const values = [...new Set(rows.map(r => r[col]))];
    return values.filter(v => v != null && v !== '').sort();
  };

  // 重置按钮：有任意筛选条件时才启用
  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== null);

  if (!columns || columns.length === 0) return null;

  return (
    <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 4 }}>
      <Space wrap align="center" style={{ width: '100%' }}>
        <FilterOutlined />
        <Text strong>筛选：</Text>

        {columns.slice(0, 6).map(col => (
          <div key={col}>
            <Text>{col}：</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 150, marginLeft: 4 }}
              onChange={(value) => handleFilterChange(col, value)}
              options={getDistinctValues(col).map(v => ({ label: String(v), value: v }))}
            />
          </div>
        ))}

        {possibleDateColumns.length > 0 && (
          <>
            <div>
              <Text>日期字段：</Text>
              <Select
                value={dateColumn}
                onChange={handleDateColumnChange}
                style={{ width: 120, marginLeft: 4 }}
                options={possibleDateColumns.map(col => ({ label: col, value: col }))}
              />
            </div>
            <div>
              <Text>统计维度：</Text>
              <Select
                value={groupBy}
                onChange={handleGroupByChange}
                style={{ width: 80, marginLeft: 4 }}
                options={GROUP_OPTIONS}
              />
            </div>
          </>
        )}

        {/* 重置按钮放在最右侧 */}
        <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={!hasActiveFilters}>
          重置
        </Button>

        {/* 执行按钮放在最后 */}
        <Button type="primary" onClick={onExecute} loading={loading}>
          查询
        </Button>

        <Button icon={<CloudDownloadOutlined />} onClick={onExport}>
          导出
        </Button>
      </Space>
    </div>
  );
}
