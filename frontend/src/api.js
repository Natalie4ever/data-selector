const API_BASE = '/api';

// 获取本地存储的 token
function getToken() {
  return localStorage.getItem('auth_token');
}

// 统一的请求辅助函数
async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 如果有 body 且不是 FormData，默认加 Content-Type
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Token 过期或无效，清除本地认证信息并刷新页面
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.reload();
    throw new Error('登录已过期，请重新登录');
  }

  return res;
}

// ==================== 辅助函数 ====================

// 对密码进行哈希（用于登录传输）
async function hashPassword(password, salt) {
  const combined = salt + password;
  // 检查 Web Crypto API 是否可用（localhost/HTTPS 下可用）
  if (crypto && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hex;
  }
  // 环境不支持 Web Crypto API，直接返回明文（后端会尝试 bcrypt 验证）
  console.warn('[AUTH] crypto.subtle 不可用，密码将明文传输');
  return password;
}

// ==================== 认证相关 ====================

export async function login(ehrNo, password) {
  // 对密码进行哈希后再传输
  const hashedPassword = await hashPassword(password, ehrNo);
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ehr_no: ehrNo, password: hashedPassword }),
  });
  if (!res.ok) throw new Error('登录请求失败');
  return res.json();
}

export async function logout() {
  const res = await fetchWithAuth(`${API_BASE}/auth/logout`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('登出失败');
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  return res.json();
}

export async function getMe() {
  const res = await fetchWithAuth(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error('获取用户信息失败');
  return res.json();
}

// ==================== 查询相关 ====================

export async function listQueries() {
  const res = await fetchWithAuth(`${API_BASE}/queries`);
  if (!res.ok) throw new Error('获取查询列表失败');
  return res.json();
}

export async function createQuery(data) {
  const res = await fetchWithAuth(`${API_BASE}/queries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建查询失败');
  return res.json();
}

export async function getQuery(queryId) {
  const res = await fetchWithAuth(`${API_BASE}/queries/${queryId}`);
  if (!res.ok) throw new Error('获取查询详情失败');
  return res.json();
}

export async function updateQuery(queryId, data) {
  const res = await fetchWithAuth(`${API_BASE}/queries/${queryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新查询失败');
  return res.json();
}

export async function deleteQuery(queryId) {
  const res = await fetchWithAuth(`${API_BASE}/queries/${queryId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除查询失败');
  return res.json();
}

export async function executeQuery(queryId, params, groupOptions = {}) {
  const res = await fetchWithAuth(`${API_BASE}/queries/${queryId}/execute`, {
    method: 'POST',
    body: JSON.stringify({
      params,
      date_column: groupOptions.dateColumn || null,
      group_by: groupOptions.groupBy || null,
    }),
  });
  if (!res.ok) throw new Error('执行查询失败');
  return res.json();
}

// ==================== 菜单相关 ====================

export async function checkIsAdmin() {
  const res = await fetchWithAuth(`${API_BASE}/auth/is-admin`);
  if (!res.ok) throw new Error('获取管理员状态失败');
  return res.json();
}

export async function getMenuTree() {
  const res = await fetchWithAuth(`${API_BASE}/menus/tree`);
  if (!res.ok) throw new Error('获取菜单失败');
  return res.json();
}

export async function createCategory(data) {
  const res = await fetchWithAuth(`${API_BASE}/menus/categories`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建菜单失败');
  return res.json();
}

export async function updateCategory(categoryId, data) {
  const res = await fetchWithAuth(`${API_BASE}/menus/categories/${categoryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新菜单失败');
  return res.json();
}

export async function deleteCategory(categoryId) {
  const res = await fetchWithAuth(`${API_BASE}/menus/categories/${categoryId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除菜单失败');
  return res.json();
}

export async function createMenuItem(data) {
  const res = await fetchWithAuth(`${API_BASE}/menus/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('创建子菜单失败');
  return res.json();
}

export async function updateMenuItem(itemId, data) {
  const res = await fetchWithAuth(`${API_BASE}/menus/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新子菜单失败');
  return res.json();
}

export async function deleteMenuItem(itemId) {
  const res = await fetchWithAuth(`${API_BASE}/menus/items/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除子菜单失败');
  return res.json();
}

// ==================== 数据源相关 ====================

export async function listDatasources() {
  const res = await fetchWithAuth(`${API_BASE}/datasources`);
  if (!res.ok) throw new Error('获取数据源列表失败');
  return res.json();
}

export async function testDatasource(dsId) {
  const res = await fetchWithAuth(`${API_BASE}/datasources/${dsId}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || '连接测试失败');
  return data;
}

// ==================== 审计日志相关 ====================

export async function canViewAuditLogs() {
  const res = await fetchWithAuth(`${API_BASE}/audit/can-view`);
  if (!res.ok) throw new Error('获取权限信息失败');
  return res.json();
}

export async function getAuditLogs(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page);
  if (params.page_size) searchParams.set('page_size', params.page_size);
  if (params.action) searchParams.set('action', params.action);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);

  const res = await fetchWithAuth(`${API_BASE}/audit/logs?${searchParams.toString()}`);
  if (!res.ok) throw new Error('获取审计日志失败');
  return res.json();
}
