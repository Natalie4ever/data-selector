import React, { useState, useEffect, useRef, useMemo } from 'react';
import { message, Modal, Card, Spin, Button, Space, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { UserOutlined, LogoutOutlined, HistoryOutlined } from '@ant-design/icons';
import QueryFormModal from './components/QueryFormModal';
import ParamsModal from './components/ParamsModal';
import FilterBar from './components/FilterBar';
import ResultTable from './components/ResultTable';
import AuditLogModal from './components/AuditLogModal';
import MenuSidebar from './components/MenuSidebar';
import MenuManageModal from './components/MenuManageModal';
import QueryCardList from './components/QueryCardList';
import LoginPage from './LoginPage';
import * as api from './api';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { confirm } = Modal;

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [initLoading, setInitLoading] = useState(true);

  // 查询相关状态
  const [queries, setQueries] = useState([]);
  const [activeQueryId, setActiveQueryId] = useState(null);
  const [activeQueryDetail, setActiveQueryDetail] = useState(null);
  const currentQueryMarker = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [paramsModalOpen, setParamsModalOpen] = useState(false);
  const [editingQuery, setEditingQuery] = useState(null);
  const [result, setResult] = useState({ columns: [], rows: [] });
  const [filters, setFilters] = useState({});
  const [timeFilters, setTimeFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);

  // 菜单相关状态
  const [menuTree, setMenuTree] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuManageOpen, setMenuManageOpen] = useState(false);
  const [menuManageMode, setMenuManageMode] = useState('add-category');
  const [menuManageData, setMenuManageData] = useState(null);

  // 当前选中的菜单项
  const [activeMenuItemId, setActiveMenuItemId] = useState(null);

  // 检查登录状态
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
        setIsLoggedIn(true);
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setInitLoading(false);
  }, []);

  // 登录成功后加载数据
  useEffect(() => {
    if (isLoggedIn) {
      loadQueries();
      loadMenuTree();
      checkAuditPermission();
    }
  }, [isLoggedIn]);

  const loadMenuTree = async () => {
    setMenuLoading(true);
    try {
      const data = await api.getMenuTree();
      setMenuTree(data);
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      console.error('加载菜单失败:', error);
    } finally {
      setMenuLoading(false);
    }
  };

  const checkAuditPermission = async () => {
    try {
      const data = await api.canViewAuditLogs();
      setCanViewAudit(data.can_view);
    } catch {
      setCanViewAudit(false);
    }
  };

  const handleLoginSuccess = (data) => {
    setCurrentUser(data.user);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      // 即使请求失败也清除本地状态
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setMenuTree([]);
    setActiveMenuItemId(null);
    message.success('已退出登录');
  };

  // 菜单管理相关
  const handleManageMenu = (mode, data) => {
    setMenuManageMode(mode);
    setMenuManageData(data);
    setMenuManageOpen(true);
  };

  const handleAddCategory = async (data) => {
    await api.createCategory(data);
    await loadMenuTree();
  };

  const handleEditCategory = async (categoryId, data) => {
    await api.updateCategory(categoryId, data);
    await loadMenuTree();
  };

  const handleDeleteCategory = async (categoryId) => {
    await api.deleteCategory(categoryId);
    await loadMenuTree();
    // 如果删除的是当前选中的菜单，重置选中状态
    if (activeMenuItemId) {
      const item = findMenuItemById(activeMenuItemId);
      if (!item) {
        setActiveMenuItemId(null);
      }
    }
  };

  const handleAddItem = async (data) => {
    await api.createMenuItem(data);
    await loadMenuTree();
  };

  const handleEditItem = async (itemId, data) => {
    await api.updateMenuItem(itemId, data);
    await loadMenuTree();
  };

  const handleDeleteItem = async (itemId) => {
    await api.deleteMenuItem(itemId);
    await loadMenuTree();
    // 如果删除的是当前选中的菜单，重置选中状态
    if (activeMenuItemId === itemId) {
      setActiveMenuItemId(null);
    }
  };

  // 根据菜单项ID查找菜单项信息
  const findMenuItemById = (itemId) => {
    for (const cat of menuTree) {
      for (const item of cat.items) {
        if (item.id === itemId) {
          return { ...item, categoryName: cat.name };
        }
      }
    }
    return null;
  };

  // 根据菜单项ID获取该菜单下的查询列表
  const getQueriesForMenuItem = (itemId) => {
    if (itemId === null) {
      // 未分类：返回所有 menu_item_id 为 null 的查询
      return queries.filter(q => !q.menu_item_id);
    }

    for (const cat of menuTree) {
      for (const item of cat.items) {
        if (item.id === itemId) {
          return item.queries || [];
        }
      }
    }
    return [];
  };

  const loadQueries = async () => {
    setAppLoading(true);
    try {
      const data = await api.listQueries();
      setQueries(data);
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      message.error('加载查询列表失败');
    } finally {
      setAppLoading(false);
    }
  };

  // 监听 activeQueryId，当切换标签时自动获取详情并执行
  useEffect(() => {
    if (!activeQueryId) return;

    const marker = { id: activeQueryId, ts: Date.now() };
    currentQueryMarker.current = marker;

    const doQuery = async () => {
      try {
        const detail = await api.getQuery(activeQueryId);

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
        if (error.message.includes('登录已过期')) {
          setIsLoggedIn(false);
          setCurrentUser(null);
          return;
        }
        message.error('加载查询详情失败');
      }
    };

    doQuery();
  }, [activeQueryId]);

  const executeQuery = async (params = {}, activeDetail) => {
    const detail = activeDetail || activeQueryDetail;
    const queryId = activeQueryId;
    if (!queryId || !detail) {
      return;
    }
    setLoading(true);
    try {
      const data = await api.executeQuery(queryId, params, timeFilters);
      setResult(data);
      setFilters({});
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      message.error('执行查询失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMenuItem = (itemId) => {
    // 切换菜单时，清空当前选中的查询
    setActiveMenuItemId(itemId);
    setActiveQueryId(null);
    setActiveQueryDetail(null);
    setResult({ columns: [], rows: [] });
  };

  const handleSelectQuery = async (queryId) => {
    const marker = { id: queryId, ts: Date.now() };
    currentQueryMarker.current = marker;

    const isSameQuery = queryId === activeQueryId;

    if (!isSameQuery) {
      // 切换到不同查询：清空旧结果和详情
      setResult({ columns: [], rows: [] });
      setActiveQueryDetail(null);
    }

    setActiveQueryId(queryId);

    if (isSameQuery && activeQueryDetail) {
      // 重复点击当前查询：直接重新执行
      if (activeQueryDetail.parameters && activeQueryDetail.parameters.length > 0) {
        setParamsModalOpen(true);
      } else {
        executeQuery({}, activeQueryDetail);
      }
    }
    // 如果是首次点击（isSameQuery 为 false），useEffect 会自动加载并执行
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
    // 新增查询时，默认属于当前选中的菜单
    if (activeMenuItemId !== null) {
      const item = findMenuItemById(activeMenuItemId);
      setEditingQuery({
        menu_item_id: activeMenuItemId,
        _menuItemName: item ? `${item.categoryName} / ${item.name}` : '',
      });
    } else {
      setEditingQuery({ menu_item_id: null });
    }
    setModalOpen(true);
  };

  const handleSaveQuery = async (data) => {
    try {
      if (editingQuery?.id) {
        await api.updateQuery(editingQuery.id, data);
        message.success('更新成功');
        const detail = await api.getQuery(editingQuery.id);
        setActiveQueryDetail(detail);
      } else {
        const id = await api.createQuery(data);
        message.success('创建成功');
        await loadQueries();
        await loadMenuTree();
        // 新增后自动选中该查询
        handleSelectQuery(id);
      }
      setModalOpen(false);
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      message.error('保存失败');
    }
  };

  const handleEditQuery = async (queryId) => {
    try {
      const detail = await api.getQuery(queryId);
      // 查找当前查询所属的菜单信息
      let menuPath = '';
      if (detail.menu_item_id) {
        const item = findMenuItemById(detail.menu_item_id);
        if (item) {
          menuPath = `${item.categoryName} / ${item.name}`;
        }
      }
      setEditingQuery({
        id: detail.id,
        display_name: detail.display_name,
        sql_text: detail.sql_text,
        parameters: detail.parameters || [],
        column_config: detail.column_config || [],
        datasource_id: detail.datasource_id || 'DS_DEFAULT',
        menu_item_id: detail.menu_item_id,
        _menuItemName: menuPath,
      });
      setModalOpen(true);
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      message.error('加载查询详情失败');
    }
  };

  const handleDeleteQuery = (queryId) => {
    const queryToDelete = queries.find(q => q.id === queryId);
    if (!queryToDelete) return;
    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除查询 "${queryToDelete.display_name}" 吗？`,
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteQuery(queryId);
          message.success('删除成功');
          // 如果删除的是当前选中的查询，清空相关状态
          if (activeQueryId === queryId) {
            setActiveQueryId(null);
            setActiveQueryDetail(null);
            setResult({ columns: [], rows: [] });
          }
          await loadQueries();
          await loadMenuTree();
        } catch (error) {
          if (error.message.includes('登录已过期')) {
            setIsLoggedIn(false);
            setCurrentUser(null);
            return;
          }
          message.error('删除失败');
        }
      },
    });
  };

  // 移动查询到指定菜单
  const handleMoveQuery = async (queryId, targetMenuItemId) => {
    try {
      await api.updateQuery(queryId, { menu_item_id: targetMenuItemId });
      message.success('移动成功');
      await loadQueries();
      await loadMenuTree();
    } catch (error) {
      if (error.message.includes('登录已过期')) {
        setIsLoggedIn(false);
        setCurrentUser(null);
        return;
      }
      message.error('移动失败');
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleTimeFiltersChange = (newTimeFilters) => {
    setTimeFilters(newTimeFilters);
    // 自动触发一次查询，将时间筛选发给后端
    if (activeQueryId && activeQueryDetail) {
      executeQuery({}, activeQueryDetail);
    }
  };

  const filteredRows = useMemo(() => {
    if (!result?.rows || !filters) return result?.rows || [];
    return result.rows.filter(row => {
      for (const [key, value] of Object.entries(filters)) {
        // 时间范围筛选
        if (key.startsWith('__time_')) {
          const col = key.replace('__time_', '');
          const timeFilter = value;
          if (timeFilter && (timeFilter.start || timeFilter.end)) {
            const rowValue = row[col];
            if (rowValue == null || rowValue === '') return false;

            const rowDate = new Date(rowValue);
            if (isNaN(rowDate.getTime())) {
              // 尝试解析其他格式
              const parts = String(rowValue).split(/[-/]/);
              if (parts.length >= 3) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const day = parseInt(parts[2].split(' ')[0]);
                rowDate.setFullYear(year, month, day);
              }
            }

            if (timeFilter.start) {
              const startDate = new Date(timeFilter.start);
              if (rowDate < startDate) return false;
            }
            if (timeFilter.end) {
              const endDate = new Date(timeFilter.end);
              // 设置结束日期为当天的23:59:59
              endDate.setHours(23, 59, 59, 999);
              if (rowDate > endDate) return false;
            }
          }
          continue;
        }

        // 普通筛选
        if (value != null && String(row[key]) !== String(value)) {
          return false;
        }
      }
      return true;
    });
  }, [result.rows, filters]);

  const handleExport = () => {
    import('xlsx').then(XLSX => {
      if (filteredRows.length === 0) {
        message.warning('没有数据可导出');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(filteredRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数据');

      const queryName = activeQueryDetail?.display_name || '导出';
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileName = `${queryName}_${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
      message.success(`导出成功：${fileName}`);
    });
  };

  // 获取当前选中菜单的名称
  const getActiveMenuItemName = () => {
    if (activeMenuItemId === null) {
      return '未分类';
    }
    const item = findMenuItemById(activeMenuItemId);
    return item ? item.name : '';
  };

  // 初始加载动画
  if (initLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  // 未登录，显示登录页面
  if (!isLoggedIn) {
    return (
      <ConfigProvider locale={zhCN}>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </ConfigProvider>
    );
  }

  // 当前菜单下的查询列表
  const currentQueries = getQueriesForMenuItem(activeMenuItemId);

  // 已登录，显示主应用
  return (
    <ConfigProvider locale={zhCN}>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Header - 占满整行 */}
      <div style={{
        height: 64,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0d47a1, #1976d2)',

        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 18,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            D
          </div> */}
          <h1 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: '#fff',
          }}>
            数据加工助手
          </h1>
        </div>
        <Space>
          {canViewAudit && (
            <Button
              // type="primary"
              icon={<HistoryOutlined />}
              onClick={() => setAuditLogOpen(true)}
            >
              操作日志
            </Button>
          )}
          <span style={{ color: 'rgba(255,255,255,0.85)' }}>
            <UserOutlined style={{ marginRight: 4 }} />
            EHR: {currentUser?.ehr_no}
          </span>
          <Button
            // type="primary"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            退出
          </Button>
        </Space>
      </div>

      {/* 主体区域 */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
        {/* 侧边栏 */}
        <div style={{
          width: 260,
          borderRight: '1px solid #f0f0f0',
          background: '#fff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 600,
            fontSize: 14,
            color: '#333',
          }}>
            菜单导航
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <MenuSidebar
              menuTree={menuTree}
              activeMenuItemId={activeMenuItemId}
              onSelectMenuItem={handleSelectMenuItem}
              onManageMenu={handleManageMenu}
              isAdmin={canViewAudit}
              loading={menuLoading}
            />
          </div>
        </div>

        {/* 主内容区 */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {appLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin tip="加载中..." />
            </div>
          ) : (
            <>
              {/* 查询卡片列表区域 */}
              <div style={{
                marginBottom: result.columns.length > 0 ? 24 : 0,
                flexShrink: 0,
              }}>
                <QueryCardList
                  queries={currentQueries}
                  activeQueryId={activeQueryId}
                  menuItemName={getActiveMenuItemName()}
                  onSelectQuery={handleSelectQuery}
                  onAddQuery={handleAddClick}
                  onEditQuery={handleEditQuery}
                  onDeleteQuery={handleDeleteQuery}
                  onMoveQuery={handleMoveQuery}
                  canManage={canViewAudit}
                  menuTree={menuTree}
                />
              </div>

              {/* 查询结果区域 */}
              {result.columns.length > 0 && (
                <Card>
                  <FilterBar
                    columns={result.columns}
                    rows={result.rows}
                    onChange={handleFilterChange}
                    onTimeFiltersChange={handleTimeFiltersChange}
                    onExecute={() => executeQuery({})}
                    onExport={handleExport}
                    loading={loading}
                  />

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
              )}

              {/* 未选中查询时的提示 */}
              {!activeQueryId && currentQueries.length > 0 && result.columns.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: 40,
                  color: '#999',
                  background: '#fff',
                  borderRadius: 8,
                  border: '1px dashed #d9d9d9',
                }}>
                  点击上方查询卡片执行查询
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <QueryFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveQuery}
        initialData={editingQuery}
        menuTree={menuTree}
        isAdmin={canViewAudit}
      />

      <ParamsModal
        open={paramsModalOpen}
        parameters={activeQueryDetail?.parameters || []}
        queryName={activeQueryDetail?.display_name || ''}
        onConfirm={handleParamsConfirm}
        onCancel={handleParamsCancel}
      />

      <AuditLogModal
        open={auditLogOpen}
        onClose={() => setAuditLogOpen(false)}
      />

      <MenuManageModal
        open={menuManageOpen}
        onClose={() => setMenuManageOpen(false)}
        mode={menuManageMode}
        data={menuManageData}
        menuTree={menuTree}
        onAddCategory={handleAddCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddItem={handleAddItem}
        onEditItem={handleEditItem}
        onDeleteItem={handleDeleteItem}
      />
    </div>
    </ConfigProvider>
  );
}
