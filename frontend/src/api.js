const API_BASE = '/api';

export async function listQueries() {
  const res = await fetch(`${API_BASE}/queries`);
  if (!res.ok) throw new Error('获取查询列表失败');
  return res.json();
}

export async function createQuery(data) {
  const res = await fetch(`${API_BASE}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建查询失败');
  return res.json();
}

export async function getQuery(queryId) {
  const res = await fetch(`${API_BASE}/queries/${queryId}`);
  if (!res.ok) throw new Error('获取查询详情失败');
  return res.json();
}

export async function updateQuery(queryId, data) {
  const res = await fetch(`${API_BASE}/queries/${queryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新查询失败');
  return res.json();
}

export async function deleteQuery(queryId) {
  const res = await fetch(`${API_BASE}/queries/${queryId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除查询失败');
  return res.json();
}

export async function executeQuery(queryId, params, groupOptions = {}, columnConfig = []) {
  const res = await fetch(`${API_BASE}/queries/${queryId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      params,
      date_column: groupOptions.dateColumn || null,
      group_by: groupOptions.groupBy || null,
      column_config: columnConfig,
    }),
  });
  if (!res.ok) throw new Error('执行查询失败');
  return res.json();
}

// ==================== 数据源相关 ====================

export async function listDatasources() {
  const res = await fetch(`${API_BASE}/datasources`);
  if (!res.ok) throw new Error('获取数据源列表失败');
  return res.json();
}

export async function testDatasource(dsId) {
  const res = await fetch(`${API_BASE}/datasources/${dsId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || '连接测试失败');
  return data;
}
