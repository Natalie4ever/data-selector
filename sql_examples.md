# SQL 查询案例参考

本文档收录了 7 个适合测试按日/周/月分组功能的 SQL 查询案例。

**数据时间范围**: 2026-03-11 至 2026-04-10（最近 30 天）

---

## 核心查询（无参数）

这些查询可以直接执行，返回日期字段，用于测试按日/周/月分组功能。

### 1. 每日销售汇总
返回各地区每日销售数据，日期字段为"日期"。

```sql
SELECT
    sale_date AS "日期",
    region AS "地区",
    ROUND(SUM(sales_amount), 2) AS "销售额",
    SUM(quantity) AS "销量",
    COUNT(*) AS "订单数"
FROM sales_data
GROUP BY sale_date, region
ORDER BY sale_date
```

**参数**: 无  
**测试方式**:
1. 直接执行查询
2. 在"日期维度"下拉框选择：日/周/月
3. 选择日期列（通常是"日期"）
4. 点击执行，查看分组结果

---

### 2. 每日交易量统计
返回各机构每日交易量数据。

```sql
SELECT
    stat_date AS "日期",
    branch_code AS "机构",
    SUM(auto_total) AS "全自动总量",
    SUM(trigger_total) AS "触发总量",
    SUM(auto_passed) AS "通过量",
    ROUND(AVG(pass_rate), 2) AS "平均通过率"
FROM transaction_detail
GROUP BY stat_date, branch_code
ORDER BY stat_date
```

**参数**: 无  
**日期维度**: `stat_date` → 日/周/月分组

---

### 3. 每日用户活跃
返回各部门每日用户活跃数据。

```sql
SELECT
    login_date AS "日期",
    department AS "部门",
    COUNT(DISTINCT user_id) AS "活跃用户数",
    SUM(active_minutes) AS "总在线时长",
    SUM(action_count) AS "总操作次数"
FROM user_activity
GROUP BY login_date, department
ORDER BY login_date
```

**参数**: 无  
**日期维度**: `login_date` → 日/周/月分组

---

### 4. 全量交易按日汇总
返回每日整体交易汇总数据，无分组维度。

```sql
SELECT
    stat_date AS "日期",
    SUM(auto_total) AS "全自动总量",
    SUM(trigger_total) AS "触发总量",
    SUM(auto_passed) AS "通过总量",
    ROUND(SUM(auto_passed) * 100.0 / NULLIF(SUM(auto_total), 0), 2) AS "整体通过率"
FROM transaction_detail
GROUP BY stat_date
ORDER BY stat_date
```

**参数**: 无  
**特点**: 最适合测试日/周/月分组功能，因为只按日期汇总

---

## 带参数的查询

### 5. 按产品每日汇总
根据产品关键词模糊搜索，返回每日数据。

```sql
SELECT
    sale_date AS "日期",
    product_name AS "产品",
    salesperson AS "销售员",
    ROUND(SUM(sales_amount), 2) AS "销售额",
    SUM(quantity) AS "销量"
FROM sales_data
WHERE product_name LIKE '%' || :p_keyword || '%'
GROUP BY sale_date, product_name, salesperson
ORDER BY sale_date
```

**参数**: `p_keyword`（产品关键词）  
**推荐测试值**: `A`（匹配产品A）

---

### 6. 按机构每日交易汇总
按指定机构查询每日交易数据。

```sql
SELECT
    stat_date AS "日期",
    branch_code AS "机构号",
    transaction_code AS "交易码",
    SUM(auto_total) AS "全自动总量",
    SUM(auto_passed) AS "通过量",
    ROUND(AVG(pass_rate), 2) AS "通过率"
FROM transaction_detail
WHERE branch_code = :p_branch
GROUP BY stat_date, branch_code, transaction_code
ORDER BY stat_date
```

**参数**: `p_branch`（机构号）  
**推荐测试值**: `B001`

---

### 7. 部门每日用户活跃
按指定部门查询每日用户活跃数据。

```sql
SELECT
    login_date AS "日期",
    department AS "部门",
    user_name AS "用户",
    active_minutes AS "在线时长",
    action_count AS "操作次数"
FROM user_activity
WHERE department = :p_dept
ORDER BY login_date, user_name
```

**参数**: `p_dept`（部门名称）  
**推荐测试值**: `研发部`

---

## 测试指南

### 测试按日/周/月分组功能步骤：

1. **选择查询**：选择上面任意一个带日期的查询（推荐用"每日销售汇总"或"全量交易按日汇总"）
2. **输入参数**：如果是带参数的查询，先输入参数值（如产品关键词 `A`）
3. **点击执行**：查看原始数据（按日汇总）
4. **切换维度**：
   - 在"日期维度"下拉框选择"周"或"月"
   - 确认"日期列"选择正确（如"日期"列）
   - 再次点击执行
5. **查看结果**：数据已按所选维度重新聚合

### 分组效果示例：

假设原始数据是每日记录：
| 日期 | 销售额 |
|------|--------|
| 2026-04-01 | 1000 |
| 2026-04-02 | 1500 |
| 2026-04-08 | 2000 |

**按周分组后**：
| 日期 | 销售额 |
|------|--------|
| 2026-W13 | 2500 |
| 2026-W14 | 2000 |

**按月分组后**：
| 日期 | 销售额 |
|------|--------|
| 2026-04 | 4500 |

---

## 数据表结构参考

### sales_data（销售数据）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| region | TEXT | 地区（华北/华东/华南/西南/华中）|
| product_name | TEXT | 产品名称（产品A-产品E）|
| sales_amount | REAL | 销售额 |
| quantity | INTEGER | 销量 |
| sale_date | TEXT | 销售日期 |
| salesperson | TEXT | 销售人员 |

### transaction_detail（交易明细）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| branch_code | TEXT | 机构号（B001-B008）|
| transaction_code | TEXT | 交易码（TX001-TX005）|
| auto_total | INTEGER | 全自动总量 |
| trigger_total | INTEGER | 触发总量 |
| auto_passed | INTEGER | 通过量 |
| pass_rate | REAL | 通过率 |
| stat_date | TEXT | 统计日期 |

### user_activity（用户活跃）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | TEXT | 用户ID |
| user_name | TEXT | 用户名 |
| login_date | TEXT | 登录日期 |
| active_minutes | INTEGER | 在线时长（分钟）|
| action_count | INTEGER | 操作次数 |
| department | TEXT | 部门 |

---

## 测试用推荐值

| 查询名称 | 参数值 |
|---------|--------|
| 按产品每日汇总 | 产品关键词 = `A` |
| 按机构每日交易汇总 | 机构号 = `B001` / `B002` / `B003` |
| 部门每日用户活跃 | 部门名称 = `研发部` / `销售部` / `市场部` |
