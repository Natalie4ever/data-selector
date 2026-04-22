import React, { useState, useMemo } from 'react';
import { Space, Select, Typography, Button, DatePicker, Collapse } from 'antd';
import dayjs from 'dayjs';
import {
  FilterOutlined,
  ReloadOutlined,
  CloudDownloadOutlined,
  ClockCircleOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// 检测字段是否为时间类型
function detectTimeFieldType(col, rows) {
  if (!rows || rows.length === 0) return null;
  const nameLower = col.toLowerCase();

  // 通过字段名判断粒度
  if (nameLower.includes('year') || nameLower.includes('年份') || nameLower === 'year') {
    return 'year';
  }
  if (nameLower.includes('month') || nameLower.includes('月份') || nameLower === 'month') {
    return 'month';
  }
  if (nameLower.includes('week') || nameLower.includes('周') || nameLower === 'week') {
    return 'week';
  }

  // 通过数据值判断（优先于字段名）
  const sample = rows[0]?.[col];
  if (typeof sample === 'string') {
    // 年：4位数字
    if (/^\d{4}$/.test(sample.trim())) return 'year';
    // 月：YYYY-MM
    if (/^\d{4}-\d{2}$/.test(sample.trim())) return 'month';
    // 周：YYYY-Www
    if (/^\d{4}-W\d{2}/.test(sample.trim())) return 'week';
    // 日期时间：YYYY-MM-DD HH:mm（有空格和时间部分）
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(sample.trim()) || /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/.test(sample.trim())) {
      return 'datetime';
    }
    // 日期：YYYY-MM-DD（无时间部分）
    if (/^\d{4}-\d{2}-\d{2}$/.test(sample.trim()) || /^\d{4}\/\d{2}\/\d{2}$/.test(sample.trim())) {
      return 'date';
    }
  }

  // 通过字段名判断是否为日期时间（兜底逻辑）
  if (nameLower.includes('time') && !nameLower.includes('datetime')) {
    return 'datetime';
  }
  if (nameLower.includes('date') || nameLower.includes('日') ||
      nameLower.includes('时间') || nameLower.includes('期')) {
    return 'date';
  }

  return null;
}

// 获取字段的去重值列表
function getDistinctValues(rows, col) {
  if (!rows) return [];
  const values = [...new Set(rows.map(r => r[col]))];
  return values.filter(v => v != null && v !== '').sort();
}

export default function FilterBar({ columns, rows, onChange, onTimeFiltersChange, onExecute, onExport, loading }) {
  const [filters, setFilters] = useState({});
  const [timeFilters, setTimeFilters] = useState({}); // { col: { start, end } }
  const [timeSectionOpen, setTimeSectionOpen] = useState(false);

  // 检测所有时间类型字段
  const timeColumns = useMemo(() => {
    if (!columns || !rows) return [];
    return columns
      .map(col => ({ col, type: detectTimeFieldType(col, rows) }))
      .filter(item => item.type !== null);
  }, [columns, rows]);

  // 普通筛选变化
  const handleFilterChange = (col, value) => {
    const newFilters = { ...filters, [col]: value };
    setFilters(newFilters);
    onChange(newFilters);
  };

  // 时间筛选变化
  const handleTimeFilterChange = (col, type, range) => {
    const newTimeFilters = { ...timeFilters };
    if (!range || range.length === 0) {
      delete newTimeFilters[col];
    } else {
      if (type === 'date') {
        // date 类型：只比较日期部分，不加时间
        newTimeFilters[col] = {
          start: range[0]?.format('YYYY-MM-DD') || null,
          end: range[1]?.format('YYYY-MM-DD') || null,
        };
      } else if (type === 'datetime') {
        // datetime 类型：使用精确时间
        newTimeFilters[col] = {
          start: range[0]?.format('YYYY-MM-DD HH:mm:ss') || null,
          end: range[1]?.format('YYYY-MM-DD HH:mm:ss') || null,
        };
      } else {
        // 其他类型（year/month/week）使用月或年的第一天/最后一天
        newTimeFilters[col] = {
          start: range[0]?.format('YYYY-MM-DD 00:00:00') || null,
          end: range[1]?.endOf('day').format('YYYY-MM-DD HH:mm:ss') || null,
        };
      }
    }
    setTimeFilters(newTimeFilters);
    // 通知父组件更新状态（用户点击"查询"按钮时会使用最新的 timeFilters）
    if (onTimeFiltersChange) {
      onTimeFiltersChange(newTimeFilters);
    }
  };

  const handleReset = () => {
    setFilters({});
    setTimeFilters({});
    onChange({});
    if (onTimeFiltersChange) {
      onTimeFiltersChange({});
    }
  };

  const handleTimeReset = () => {
    const emptyTimeFilters = {};
    setTimeFilters(emptyTimeFilters);
    if (onTimeFiltersChange) {
      onTimeFiltersChange(emptyTimeFilters);
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 0 || Object.keys(timeFilters).length > 0;

  if (!columns || columns.length === 0) return null;

  // 普通筛选字段（非时间字段）
  const filterColumns = columns.slice(0, 6);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 普通筛选行 */}
      <div style={{ padding: 12, background: '#fafafa', borderRadius: '4px 4px 0 0' }}>
        <Space wrap align="center" style={{ width: '100%' }}>
          <FilterOutlined />
          <Text strong>筛选：</Text>

          {filterColumns.map(col => {
            const distinctValues = getDistinctValues(rows, col);
            const options = distinctValues.map(v => ({ label: String(v), value: v }));
            const currentValue = filters[col];

            return (
              <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Text>{col}：</Text>
                <Select
                  showSearch
                  allowClear
                  placeholder="全部"
                  style={{ width: 150 }}
                  value={currentValue}
                  onChange={(value) => handleFilterChange(col, value)}
                  onSearch={() => {}}
                  filterOption={(input, option) => {
                    if (!input) return true;
                    const label = String(option.label || '').toLowerCase();
                    return label.includes(input.toLowerCase());
                  }}
                  options={options}
                  notFoundContent="无匹配项"
                />
              </div>
            );
          })}

          {/* 重置按钮 */}
          <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={!hasActiveFilters}>
            重置
          </Button>

          <Button type="primary" onClick={onExecute} loading={loading}>
            查询
          </Button>

          <Button icon={<CloudDownloadOutlined />} onClick={onExport}>
            导出
          </Button>
        </Space>
      </div>

      {/* 时间筛选区域 */}
      {timeColumns.length > 0 && (
        <div style={{
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: '0 0 4px 4px',
          borderTop: '1px solid #f0f0f0',
        }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setTimeSectionOpen(!timeSectionOpen)}
          >
            <ClockCircleOutlined style={{ marginRight: 6, color: '#1890ff' }} />
            <Text strong style={{ marginRight: 8 }}>时间筛选</Text>
            {Object.keys(timeFilters).length > 0 && (
              <span style={{
                background: '#1890ff',
                color: '#fff',
                borderRadius: 10,
                padding: '0 6px',
                fontSize: 11,
                marginRight: 8,
              }}>
                {Object.keys(timeFilters).length}
              </span>
            )}
            {timeSectionOpen ? <DownOutlined style={{ fontSize: 12 }} /> : <RightOutlined style={{ fontSize: 12 }} />}
          </div>

          {timeSectionOpen && (
            <div style={{ marginTop: 10 }}>
              <Space wrap align="center" style={{ width: '100%' }}>
                {timeColumns.map(({ col, type }) => {
                  const timeFilter = timeFilters[col];
                  const label = getTimeLabel(type);

                  if (type === 'year') {
                    return (
                      <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Text>{col}：</Text>
                        <RangePicker
                          picker="year"
                          placeholder={['开始年份', '结束年份']}
                          style={{ width: 200 }}
                          value={timeFilter ? [
                            timeFilter.start ? dayjs(timeFilter.start) : null,
                            timeFilter.end ? dayjs(timeFilter.end) : null,
                          ] : null}
                          onChange={(dates) => handleTimeFilterChange(col, type, dates)}
                          allowClear
                        />
                      </div>
                    );
                  }

                  if (type === 'month') {
                    return (
                      <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Text>{col}：</Text>
                        <RangePicker
                          picker="month"
                          placeholder={['开始', '结束']}
                          style={{ width: 200 }}
                          value={timeFilter ? [
                            timeFilter.start ? dayjs(timeFilter.start) : null,
                            timeFilter.end ? dayjs(timeFilter.end) : null,
                          ] : null}
                          onChange={(dates) => handleTimeFilterChange(col, type, dates)}
                          allowClear
                        />
                      </div>
                    );
                  }

                  if (type === 'week') {
                    return (
                      <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Text>{col}：</Text>
                        <RangePicker
                          picker="week"
                          placeholder={['开始周', '结束周']}
                          style={{ width: 200 }}
                          value={timeFilter ? [
                            timeFilter.start ? dayjs(timeFilter.start) : null,
                            timeFilter.end ? dayjs(timeFilter.end) : null,
                          ] : null}
                          onChange={(dates) => handleTimeFilterChange(col, type, dates)}
                          allowClear
                        />
                      </div>
                    );
                  }

                  if (type === 'datetime') {
                    // datetime 类型：显示时间选择
                    return (
                      <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Text>{col}：</Text>
                        <RangePicker
                          showTime
                          placeholder={['开始时间', '结束时间']}
                          style={{ width: 320 }}
                          value={timeFilter ? [
                            timeFilter.start ? dayjs(timeFilter.start) : null,
                            timeFilter.end ? dayjs(timeFilter.end) : null,
                          ] : null}
                          onChange={(dates) => handleTimeFilterChange(col, type, dates)}
                          allowClear
                        />
                      </div>
                    );
                  }

                  // date 类型：纯日期，不显示时间选择
                  return (
                    <div key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Text>{col}：</Text>
                      <RangePicker
                        picker="date"
                        placeholder={['开始日期', '结束日期']}
                        style={{ width: 220 }}
                        value={timeFilter ? [
                          timeFilter.start ? dayjs(timeFilter.start) : null,
                          timeFilter.end ? dayjs(timeFilter.end) : null,
                        ] : null}
                        onChange={(dates) => handleTimeFilterChange(col, type, dates)}
                        allowClear
                      />
                    </div>
                  );
                })}

                {/* 时间筛选重置 */}
                <Button
                  size="middle"
                  onClick={handleTimeReset}
                  disabled={Object.keys(timeFilters).length === 0}
                >
                  重置时间
                </Button>
              </Space>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 获取时间类型标签
function getTimeLabel(type) {
  switch (type) {
    case 'year': return '年';
    case 'month': return '月';
    case 'week': return '周';
    case 'date': return '日期';
    default: return '时间';
  }
}
