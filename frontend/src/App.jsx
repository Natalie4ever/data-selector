import React, { useState, useEffect, useRef, useMemo } from 'react';
import { message, Modal, Card, Spin } from 'antd';
import QueryTabs from './components/QueryTabs';
import QueryFormModal from './components/QueryFormModal';
import ParamsModal from './components/ParamsModal';
import FilterBar from './components/FilterBar';
import ResultTable from './components/ResultTable';
import * as api from './api';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { confirm } = Modal;

export default function App() {
  const [queries, setQueries] = useState([]);
  const [activeQueryId, setActiveQueryId] = useState(null);
  const [activeQueryDetail, setActiveQueryDetail] = useState(null);
  const currentQueryMarker = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [paramsModalOpen, setParamsModalOpen] = useState(false);
  const [editingQuery, setEditingQuery] = useState(null);
  const [result, setResult] = useState({ columns: [], rows: [] });
  const [filters, setFilters] = useState({});
  const [groupOptions, setGroupOptions] = useState({ dateColumn: null, groupBy: 'day' });
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    loadQueries();
  }, []);

  // 监听 activeQueryId，当切换标签时自动获取详情并执行
  useEffect(() => {
    if (!activeQueryId) return;

    const marker = { id: activeQueryId, ts: Date.now() };
    currentQueryMarker.current = marker;

    const doQuery = async () => {
      try {
        const detail = await api.getQuery(activeQueryId);

        // 已经被后续请求覆盖，忽略
        if (currentQueryMarker.current?.id !== marker.id || currentQueryMarker.current?.ts !== marker.ts) {
          return;
        }

        setActiveQueryDetail(detail);

        if (detail.parameters && detail.parameters.length > 0) {
          setParamsModalOpen(true);
        } else {
          executeQuery({}, detail);
        }
      } catch (error) {
        message.error('加载查询详情失败');
      }
    };

    doQuery();
  }, [activeQueryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadQueries = async () => {
    try {
      const data = await api.listQueries();
      setQueries(data);
      setInitLoading(false);
    } catch (error) {
      message.error('加载查询列表失败');
      setInitLoading(false);
    }
  };

  const executeQuery = async (params = {}, activeDetail) => {
    const detail = activeDetail || activeQueryDetail;
    const queryId = activeQueryId;
    console.log('[executeQuery] 开始执行', { queryId, hasDetail: !!detail });
    if (!queryId || !detail) {
      console.log('[executeQuery] 跳过：缺少 queryId 或 detail', { queryId, detail });
      return;
    }
    setLoading(true);
    try {
      const columnConfig = detail.column_config || [];
      console.log('[executeQuery] 调用API', { columnConfig });
      const data = await api.executeQuery(queryId, params, groupOptions, columnConfig);
      console.log('[executeQuery] 收到结果', data);
      setResult(data);
      setFilters({});
    } catch (error) {
      message.error('执行查询失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuery = async (queryId) => {
    // 用 ref 标记本次请求，避免 setState 异步问题
    const marker = { id: queryId, ts: Date.now() };
    currentQueryMarker.current = marker;

    setActiveQueryId(queryId);
    setFilters({});
    setResult({ columns: [], rows: [] });
    setActiveQueryDetail(null); // 先清空，useEffect 会自动触发
  };

  const handleParamsConfirm = (params) => {
    setParamsModalOpen(false);
    executeQuery(params);
  };

  const handleParamsCancel = () => {
    setParamsModalOpen(false);
  };

  const handleAddClick = () => {
    setEditingQuery(null);
    setModalOpen(true);
  };

  const handleSaveQuery = async (data) => {
    try {
      if (editingQuery) {
        await api.updateQuery(editingQuery.id, data);
        message.success('更新成功');
        const detail = await api.getQuery(editingQuery.id);
        setActiveQueryDetail(detail);
      } else {
        const id = await api.createQuery(data);
        message.success('创建成功');
        await loadQueries();
        handleSelectQuery(id);
      }
      setModalOpen(false);
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleEditQuery = async (queryId) => {
    try {
      const detail = await api.getQuery(queryId);
      setEditingQuery({
        id: detail.id,
        display_name: detail.display_name,
        sql_text: detail.sql_text,
        parameters: detail.parameters || [],
        column_config: detail.column_config || [],
        datasource_id: detail.datasource_id || 'DS_DEFAULT',
      });
      setModalOpen(true);
    } catch (error) {
      message.error('加载查询详情失败');
    }
  };

  const handleDeleteQuery = (queryId) => {
    const queryToDelete = queryId ? queries.find(q => q.id === queryId) : null;
    const target = queryToDelete || activeQueryDetail;
    if (!target) return;
    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除查询 "${target.display_name}" 吗？`,
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteQuery(target.id);
          message.success('删除成功');
          setActiveQueryId(null);
          setActiveQueryDetail(null);
          setResult({ columns: [], rows: [] });
          await loadQueries();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleFilterChange = (newFilters, newGroupOptions) => {
    setFilters(newFilters);
    if (newGroupOptions) {
      setGroupOptions(newGroupOptions);
    }
  };

  const handleDateColumnChange = (dateColumn, groupBy) => {
    setGroupOptions({ dateColumn, groupBy });
  };

  // 计算过滤后的数据（所见即所得）
  const filteredRows = useMemo(() => {
    if (!result?.rows || !filters) return result?.rows || [];
    return result.rows.filter(row => {
      for (const [col, value] of Object.entries(filters)) {
        if (value != null && String(row[col]) !== String(value)) {
          return false;
        }
      }
      return true;
    });
  }, [result.rows, filters]);

  const handleExport = () => {
    // 动态导入 xlsx，避免打包体积过大
    import('xlsx').then(XLSX => {
      if (filteredRows.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      // 将对象数组转为工作表
      const ws = XLSX.utils.json_to_sheet(filteredRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数据');

      // 生成文件名: {sql名}_{当前日期}.xlsx
      const queryName = activeQueryDetail?.display_name || '导出';
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileName = `${queryName}_${dateStr}.xlsx`;

      // 触发下载
      XLSX.writeFile(wb, fileName);
      message.success(`导出成功：${fileName}`);
    });
  };

  if (initLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>数据加工助手</h1>

      <Card>
        <QueryTabs
          queries={queries}
          activeId={activeQueryId}
          onSelect={handleSelectQuery}
          onAddClick={handleAddClick}
          onEdit={handleEditQuery}
          onDelete={handleDeleteQuery}
        />

        {result.columns.length > 0 && (
          <FilterBar
            columns={result.columns}
            rows={result.rows}
            onChange={handleFilterChange}
            dateColumnChanged={handleDateColumnChange}
            onExecute={() => executeQuery({})}
            onExport={handleExport}
            loading={loading}
          />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="执行查询中..." />
          </div>
        ) : (
          <ResultTable
            columns={result.columns}
            rows={result.rows}
            filters={filters}
          />
        )}
      </Card>

      <QueryFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveQuery}
        initialData={editingQuery}
      />

      <ParamsModal
        open={paramsModalOpen}
        parameters={activeQueryDetail?.parameters || []}
        queryName={activeQueryDetail?.display_name || ''}
        onConfirm={handleParamsConfirm}
        onCancel={handleParamsCancel}
      />
    </div>
  );
}
