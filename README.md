# 数据加工助手

基于 FastAPI + React 的动态 SQL 查询工具，支持配置查询、动态筛选、日期分组。

## 功能特性

- ✅ 动态配置查询（SQL + 参数定义）
- ✅ 多标签页管理多个查询
- ✅ 支持命名参数（`:param_name`）
- ✅ 自动生成筛选器
- ✅ 支持按日期字段按日/周/月分组汇总（后端执行分组）
- ✅ 编辑/删除配置

## 项目结构

```
├── backend/
│   ├── requirements.txt     # Python依赖
│   ├── main.py              # FastAPI入口
│   ├── models.py            # 数据模型
│   ├── crud.py              # CRUD操作
│   └── database.py          # 数据库连接
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── api.js
        ├── components/
        │   ├── QueryTabs.jsx        # 标签栏
        │   ├── QueryFormModal.jsx   # 新增/编辑弹窗
        │   ├── ParameterBar.jsx     # 参数输入
        │   ├── FilterBar.jsx        # 筛选器
        │   └── ResultTable.jsx      # 结果表格
        └── main.jsx
```

## 快速开始

### 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端访问地址：http://localhost:5173

## 使用流程

1. 点击「新增查询」
2. 填写显示名称和SQL脚本，添加参数定义
3. 保存后点击标签，输入参数值，点击执行
4. 查看结果，可以通过筛选器筛选数据
5. 若查询结果含日期字段，可以切换日/周/月维度分组汇总

## 示例

SQL示例：
```sql
SELECT 
  一级分行机构号, 
  交易码,
  投产全自动交易总量,
  触发全自动交易总量,
  全自动通过业务量,
  通过率,
  统计日期
FROM 交易明细表 
WHERE 统计日期 = :p_date
```

参数定义：
- 参数名：`p_date`
- 显示名称：`统计日期`
- 类型：`date`
