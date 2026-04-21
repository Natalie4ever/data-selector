# 数据加工助手 — 程序员快速上手指南

## 1. 项目简介

数据加工助手是一个基于 Web 的 SQL 查询工具，支持连接多种数据库（SQLite / MySQL / PostgreSQL / Oracle / SQL Server），提供查询的创建、保存、执行、导出等功能。

### 技术栈

| 层级 | 技术 | 版本要求 |
|-----|------|---------|
| 前端 | React 18 + Vite + Ant Design 5 | Node.js 16+ |
| 后端 | FastAPI + Uvicorn | Python 3.8+ |
| 数据库 | SQLite（元数据存储）| 内置，无需额外安装 |
| 认证 | JWT + SHA-256 前端哈希 | — |
| 加密 | AES-256-CBC（密码加密）| pycryptodome |

### 项目目录结构

```
data-selector/
├── backend/
│   ├── main.py                 # FastAPI 入口，所有 API 接口
│   ├── auth.py                 # 认证模块（JWT、密码哈希、用户查询）
│   ├── crud.py                 # 查询的增删改查
│   ├── models.py               # Pydantic 数据模型
│   ├── audit.py                # 操作日志模块
│   ├── datasource_manager.py   # 数据源管理、连接构建、密码解密
│   ├── database.py             # SQLite 连接工具
│   ├── data.db                 # 内置 SQLite 数据库（自动生成）
│   └── logs/                   # 操作日志文件目录（自动生成）
│       └── audit_YYYY-MM-DD.log
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # 主应用组件
│   │   ├── api.js              # 所有 API 调用
│   │   ├── LoginPage.jsx       # 登录页面
│   │   └── components/
│   │       ├── QueryTabs.jsx       # 查询标签管理
│   │       ├── QueryFormModal.jsx  # 新增/编辑查询弹窗
│   │       ├── ParamsModal.jsx     # 参数输入弹窗
│   │       ├── FilterBar.jsx       # 筛选栏（日期分组、导出）
│   │       ├── ResultTable.jsx     # 结果表格
│   │       └── AuditLogModal.jsx   # 操作日志查看
│   ├── vite.config.js          # Vite 配置
│   └── package.json
├── encrypt_tool.py             # 密码加密工具
├── .env                        # 环境变量配置（需自行创建）
├── .env.example                # 环境变量示例
└── docs/
    └── USER_GUIDE.md           # 本文档
```

---

## 2. 环境准备

### 2.1 安装 Python

要求 Python 3.8+。

```bash
python --version
```

### 2.2 安装 Node.js

要求 Node.js 16+。

```bash
node --version
npm --version
```

### 2.3 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

如需连接特定数据库，还需安装对应驱动：

| 数据库 | 安装命令 |
|-------|---------|
| MySQL | `pip install pymysql` |
| PostgreSQL | `pip install psycopg2-binary` |
| Oracle | `pip install oracledb` |
| SQL Server | `pip install pymssql` |

### 2.4 安装前端依赖

```bash
cd frontend
npm install
```

---

## 3. 快速启动

### 3.1 配置环境变量

复制示例配置并修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少配置以下内容：

```env
# 加密密钥（必须配置）
DS_DECRYPT_KEY=your-base64-encoded-32-byte-key-here
DS_DECRYPT_IV=your-base64-encoded-16-byte-iv-here

# 内置数据库（默认配置即可）
DS_DEFAULT_TYPE=sqlite
DS_DEFAULT_DB=./backend/data.db

# JWT 密钥（建议修改）
AUTH_SECRET_KEY=change-me-to-a-real-secret-key-in-production
AUTH_ALGORITHM=HS256
AUTH_EXPIRE_HOURS=24
```

### 3.2 生成加密密钥

运行加密工具生成密钥对：

```bash
python encrypt_tool.py
```

输出示例：

```
=== 密钥生成完成 ===
请将以下内容添加到 .env 文件：

DS_DECRYPT_KEY=WSbGccQjBqGWZbDHvbgX2MQtA9QykCIAp8GGdKE9woA=
DS_DECRYPT_IV=CeLMWiv8UAxdZklF9fK1Hw==
```

将输出的密钥复制到 `.env` 文件中。

### 3.3 启动后端

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

启动成功后，访问 `http://localhost:8000/docs` 可查看自动生成的 API 文档。

### 3.4 启动前端

```bash
cd frontend
npm run dev
```

启动成功后，访问 `http://localhost:5173` 打开应用。

### 3.5 默认登录账号

| EHR 号 | 密码 |
|-------|------|
| `1234567` | `Password01!` |
| `1234568` | `Password01!` |

---

## 4. 数据源配置

数据源通过 `.env` 文件配置，采用统一的命名规范：

```
DS_<项目标识>_<字段名>
```

### 4.1 配置字段说明

| 字段 | 说明 | 是否必填 |
|-----|------|---------|
| `NAME` | 数据源显示名称 | 是 |
| `TYPE` | 数据库类型：`sqlite` / `mysql` / `postgres` / `oracle` / `sqlserver` | 是 |
| `HOST` | 主机地址 | MySQL/PG/Oracle/SQL Server 必填 |
| `PORT` | 端口号（可选，使用默认端口时可省略） | 否 |
| `DB` | 数据库名（MySQL/PG/SQL Server）或文件路径（SQLite） | 是 |
| `USER` | 用户名 | MySQL/PG/Oracle/SQL Server 必填 |
| `PASS` | 明文密码（仅调试用，不推荐） | 否 |
| `PASS_ENC` | 加密后的密码（推荐） | 否 |
| `SID` | Oracle 实例 ID（与 SERVICE 二选一） | Oracle 可选 |
| `SERVICE` | Oracle 服务名（与 SID 二选一） | Oracle 可选 |

### 4.2 SQLite 配置示例

```env
DS_LOCAL_NAME=本地 SQLite 数据库
DS_LOCAL_TYPE=sqlite
DS_LOCAL_DB=C:/path/to/your/database.db
```

### 4.3 MySQL 配置示例

```env
DS_MYSQL_NAME=MySQL 测试库
DS_MYSQL_TYPE=mysql
DS_MYSQL_HOST=192.168.1.100
DS_MYSQL_PORT=3306
DS_MYSQL_DB=testdb
DS_MYSQL_USER=root
DS_MYSQL_PASS_ENC=加密后的密码字符串
```

### 4.4 PostgreSQL 配置示例

```env
DS_PG_NAME=PostgreSQL 生产库
DS_PG_TYPE=postgres
DS_PG_HOST=192.168.1.101
DS_PG_PORT=5432
DS_PG_DB=production
DS_PG_USER=postgres
DS_PG_PASS_ENC=加密后的密码字符串
```

### 4.5 Oracle 配置示例

```env
DS_ORA_NAME=Oracle 业务库
DS_ORA_TYPE=oracle
DS_ORA_HOST=192.168.1.102
DS_ORA_PORT=1521
DS_ORA_SERVICE=ORCLPDB1
DS_ORA_USER=readonly_user
DS_ORA_PASS_ENC=加密后的密码字符串
```

### 4.6 SQL Server 配置示例

```env
DS_MSSQL_NAME=SQL Server 数据库
DS_MSSQL_TYPE=sqlserver
DS_MSSQL_HOST=192.168.1.103
DS_MSSQL_PORT=1433
DS_MSSQL_DB=MyDatabase
DS_MSSQL_USER=sa
DS_MSSQL_PASS_ENC=加密后的密码字符串
```

### 4.7 内置数据库（默认）

```env
DS_DEFAULT_TYPE=sqlite
DS_DEFAULT_DB=./backend/data.db
```

内置数据库用于存储已保存的查询、用户信息和系统配置，一般无需修改。

---

## 5. 密码加密

### 5.1 为什么要加密

数据库连接密码如果以明文存储在 `.env` 文件中，存在泄露风险。本项目使用 AES-256-CBC 算法对密码进行加密，确保配置文件安全。

### 5.2 使用加密工具

#### 步骤 1：生成密钥

```bash
python encrypt_tool.py
```

输出：

```
=== 密钥生成完成 ===
请将以下内容添加到 .env 文件：

DS_DECRYPT_KEY=WSbGccQjBqGWZbDHvbgX2MQtA9QykCIAp8GGdKE9woA=
DS_DECRYPT_IV=CeLMWiv8UAxdZklF9fK1Hw==
```

将这两行添加到 `.env` 文件。

#### 步骤 2：加密数据库密码

```bash
python encrypt_tool.py "你的数据库密码"
```

输出示例：

```
=== 密码加密结果 ===
明文密码: MySecretPassword123
加密结果: GkXfYZJQmF2Z0pHZWxwQ29kZQ==

请将以下内容添加到 .env 文件：
DS_XXX_PASS_ENC=GkXfYZJQmF2Z0pHZWxwQ29kZQ==
```

#### 步骤 3：配置到 .env

将加密结果填入对应数据源的 `PASS_ENC` 字段：

```env
DS_MYSQL_PASS_ENC=GkXfYZJQmF2Z0pHZWxwQ29kZQ==
```

### 5.3 加密原理

```
明文密码 → AES-256-CBC 加密 → Base64 编码 → 存入 PASS_ENC
PASS_ENC → Base64 解码 → AES-256-CBC 解密 → 明文密码（用于连接）
```

- **密钥（Key）**：32 字节，Base64 编码后存入 `DS_DECRYPT_KEY`
- **偏移量（IV）**：16 字节，Base64 编码后存入 `DS_DECRYPT_IV`
- **密钥只需生成一次**，所有数据源共用同一组密钥

---

## 6. 认证系统

### 6.1 内置用户认证

默认使用内置 SQLite 数据库存储用户信息，无需额外配置。

**默认用户：**

| EHR 号 | 密码 |
|-------|------|
| `1234567` | `Password01!` |
| `1234568` | `Password01!` |

### 6.2 外部数据源认证

支持从外部数据库（MySQL / PostgreSQL / Oracle / SQL Server）中验证用户。

配置方式（在 `.env` 中添加）：

```env
# 认证数据源 ID（对应已配置的数据源标识）
AUTH_DS_ID=DS_MYSQL

# 用户表名
AUTH_TABLE=employees

# EHR 号字段名
AUTH_EHR_COLUMN=ehr_no

# 密码字段名
AUTH_PWD_COLUMN=password
```

> **注意**：外部数据源中的密码应存储为 bcrypt 哈希值。

### 6.3 JWT 配置

```env
# JWT 签名密钥（生产环境请使用强随机字符串）
AUTH_SECRET_KEY=change-me-to-a-real-secret-key-in-production

# 签名算法
AUTH_ALGORITHM=HS256

# Token 有效期（小时）
AUTH_EXPIRE_HOURS=24
```

### 6.4 密码验证机制

- **前端**：使用 SHA-256 对密码进行加盐哈希（盐值 = EHR 号），再发送给后端
- **后端**：自动识别哈希格式（SHA-256 / bcrypt）并进行验证
- **传输安全**：即使被截获，攻击者拿到的也是哈希值而非明文密码

---

## 7. 操作日志

### 7.1 日志存储

操作日志同时存储在两个位置：

| 存储方式 | 位置 | 用途 |
|---------|------|------|
| SQLite 数据库 | `backend/data.db` 的 `operation_logs` 表 | 前端界面查询 |
| 日志文件 | `backend/logs/audit_YYYY-MM-DD.log` | 离线分析、归档 |

### 7.2 日志文件格式

每天一个日志文件，每行一条 JSON 记录：

```json
{"id":1,"timestamp":"2026-04-16T10:30:00","ehr_no":"1234567","action":"LOGIN","target_type":"auth","detail":{"ehr_no":"1234567"},"ip_address":"127.0.0.1","status":"success"}
```

### 7.3 记录的操作类型

| 操作类型 | 说明 |
|---------|------|
| `LOGIN` | 登录（成功/失败） |
| `LOGOUT` | 登出 |
| `QUERY_CREATE` | 创建查询 |
| `QUERY_UPDATE` | 修改查询（含修改前内容） |
| `QUERY_DELETE` | 删除查询 |
| `QUERY_EXECUTE` | 执行查询（含参数和行数） |
| `DATASOURCE_TEST` | 测试数据源连接 |

### 7.4 白名单配置

只有白名单内的用户才能查看操作日志和管理查询（新增/编辑/删除）。

通过数据库直接修改白名单：

```sql
-- 查看当前白名单
SELECT value FROM app_config WHERE key = 'audit_viewer_whitelist';

-- 更新白名单
UPDATE app_config 
SET value = '["1234567","1234568","新EHR号"]' 
WHERE key = 'audit_viewer_whitelist';
```

---

## 8. 局域网访问

### 8.1 配置前端监听

修改 `frontend/vite.config.js`，确保 `host` 设置为 `0.0.0.0`：

```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // 允许局域网访问
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
})
```

### 8.2 配置后端监听

后端 `backend/main.py` 已默认监听 `0.0.0.0`：

```python
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

### 8.3 开放 Windows 防火墙

以管理员身份运行命令提示符：

```bash
# 放行前端端口（默认 5173）
netsh advfirewall firewall add rule name="Data Selector Frontend" dir=in action=allow protocol=tcp localport=5173

# 放行后端端口（默认 8000）
netsh advfirewall firewall add rule name="Data Selector Backend" dir=in action=allow protocol=tcp localport=8000
```

### 8.4 查看本机 IP

```bash
ipconfig
```

找到「IPv4 地址」，例如 `192.168.1.5`。

### 8.5 访问方式

同一局域网内的其他设备访问：

```
http://192.168.1.5:5173
```

---

## 9. API 接口文档

### 9.1 认证接口

#### POST /api/auth/login

用户登录。

**请求体：**

```json
{
  "ehr_no": "1234567",
  "password": "前端SHA256哈希值"
}
```

> **说明**：前端会对密码进行 SHA-256 加盐哈希（盐值为 EHR 号），将哈希值发送给后端。

**成功响应（200）：**

```json
{
  "success": true,
  "message": "登录成功",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "ehr_no": "1234567" }
}
```

**失败响应（200）：**

```json
{
  "success": false,
  "message": "EHR号或密码错误",
  "token": null,
  "user": null
}
```

---

#### POST /api/auth/logout

用户登出（需登录）。

**请求头：**

```
Authorization: Bearer <token>
```

**响应（200）：**

```json
{ "success": true, "message": "登出成功" }
```

---

#### GET /api/auth/me

获取当前登录用户信息（需登录）。

**请求头：**

```
Authorization: Bearer <token>
```

**响应（200）：**

```json
{ "ehr_no": "1234567" }
```

---

### 9.2 查询接口

#### GET /api/queries

获取所有已保存的查询列表（需登录）。

**响应（200）：**

```json
[
  {
    "id": 1,
    "display_name": "销售报表",
    "parameters": [
      { "name": "start_date", "label": "开始日期", "type": "date" }
    ],
    "datasource_id": "DS_MYSQL"
  }
]
```

---

#### POST /api/queries

创建新查询（需登录）。

**请求体：**

```json
{
  "display_name": "销售报表",
  "sql_text": "SELECT * FROM sales WHERE date >= :start_date",
  "parameters": [
    { "name": "start_date", "label": "开始日期", "type": "date" }
  ],
  "column_config": [
    { "name": "amount", "agg_type": "SUM" }
  ],
  "datasource_id": "DS_MYSQL"
}
```

**响应（200）：** 新建查询的 ID（整数）

---

#### GET /api/queries/{query_id}

获取指定查询的详情（需登录）。

**响应（200）：**

```json
{
  "id": 1,
  "display_name": "销售报表",
  "sql_text": "SELECT * FROM sales WHERE date >= :start_date",
  "parameters": [...],
  "column_config": [...],
  "datasource_id": "DS_MYSQL"
}
```

---

#### PUT /api/queries/{query_id}

更新指定查询（需登录）。

**请求体：** 与创建接口相同，字段可选。

**响应（200）：**

```json
{ "status": "ok" }
```

---

#### DELETE /api/queries/{query_id}

删除指定查询（需登录）。

**响应（200）：**

```json
{ "status": "ok" }
```

---

#### POST /api/queries/{query_id}/execute

执行查询（需登录）。

**请求体：**

```json
{
  "params": { "start_date": "2026-01-01" },
  "date_column": "order_date",
  "group_by": "month",
  "column_config": [
    { "name": "amount", "agg_type": "SUM" },
    { "name": "quantity", "agg_type": "AVG" }
  ]
}
```

**响应（200）：**

```json
{
  "columns": ["order_date", "amount", "quantity"],
  "rows": [
    { "order_date": "2026-01", "amount": 150000, "quantity": 50 }
  ],
  "types": { "amount": 1, "quantity": 1 }
}
```

---

### 9.3 数据源接口

#### GET /api/datasources

获取所有数据源列表（不含密码）（需登录）。

**响应（200）：**

```json
[
  {
    "id": "DS_MYSQL",
    "name": "MySQL 测试库",
    "db_type": "mysql",
    "host": "192.168.1.100",
    "port": 3306,
    "database": "testdb",
    "username": "root",
    "has_password": true
  }
]
```

---

#### POST /api/datasources/{ds_id}/test

测试指定数据源的连接（需登录）。

**响应（200）：**

```json
{ "success": true, "message": "连接成功" }
```

---

### 9.4 审计日志接口

#### GET /api/audit/logs

分页查询操作日志（需登录且在白名单内）。

**查询参数：**

| 参数 | 类型 | 说明 |
|-----|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页条数，默认 20 |
| `action` | string | 操作类型筛选 |
| `start_date` | string | 开始日期（YYYY-MM-DD） |
| `end_date` | string | 结束日期（YYYY-MM-DD） |

**响应（200）：**

```json
{
  "logs": [
    {
      "id": 1,
      "ehr_no": "1234567",
      "action": "QUERY_EXECUTE",
      "target_type": "query",
      "target_id": "5",
      "detail": { "params": {}, "row_count": 100 },
      "before_value": null,
      "ip_address": "192.168.1.5",
      "status": "success",
      "created_at": "2026-04-16T10:30:00"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

---

#### GET /api/audit/can-view

检查当前用户是否有权限查看审计日志（需登录）。

**响应（200）：**

```json
{ "can_view": true }
```

---

### 9.5 通用说明

#### 请求头

所有需要登录的接口需在请求头中携带 Token：

```
Authorization: Bearer <token>
```

#### 错误响应

| HTTP 状态码 | 说明 |
|------------|------|
| 401 | 未登录或 Token 已过期 |
| 403 | 无权限（如非白名单用户访问审计日志） |
| 404 | 资源不存在 |
| 400 | 请求参数错误 |

---

## 10. 常见问题

### Q1：登录时提示"EHR号或密码错误"

**排查步骤：**

1. 确认 EHR 号和密码正确（默认账号：`1234567` / `Password01!`）
2. 检查浏览器控制台（F12）是否有报错
3. 如果是旧用户，数据库中可能是 bcrypt 格式密码，需重启后端服务自动迁移
4. 检查后端日志是否有 `[AUTH]` 相关输出

### Q2：别人无法通过 IP 访问前端

**排查步骤：**

1. 确认 `vite.config.js` 中 `host` 设置为 `0.0.0.0`
2. 确认已开放 Windows 防火墙端口（5173）
3. 确认访问者与你在同一局域网

### Q3：连接外部数据库失败

**排查步骤：**

1. 确认 `.env` 中数据源配置格式正确
2. 确认已安装对应数据库驱动（如 `pymysql`、`psycopg2-binary`）
3. 确认数据库服务器允许你的 IP 访问
4. 点击「测试连接」按钮查看具体错误信息

### Q4：前端页面空白或报错

**排查步骤：**

1. 确认后端已启动（访问 `http://localhost:8000/docs` 验证）
2. 检查浏览器控制台（F12）的错误信息
3. 确认 `vite.config.js` 中代理配置正确

### Q5：操作日志文件没有生成

**排查步骤：**

1. 确认 `backend/logs/` 目录存在（不存在时会自动创建）
2. 确认目录有写入权限
3. 检查后端日志是否有 `[AUDIT]` 相关警告

### Q6：修改配置后不生效

**解决方法：**

修改 `.env` 文件后需要**重启后端服务**才能生效。

---

## 附录：快速命令参考

```bash
# 生成加密密钥
python encrypt_tool.py

# 加密密码
python encrypt_tool.py "你的密码"

# 启动后端
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 启动前端
cd frontend && npm run dev

# 开放防火墙端口
netsh advfirewall firewall add rule name="Data Selector Frontend" dir=in action=allow protocol=tcp localport=5173
netsh advfirewall firewall add rule name="Data Selector Backend" dir=in action=allow protocol=tcp localport=8000
```
