"""
测试数据生成脚本
为 data-selector 项目生成示例数据和查询配置
"""
import sqlite3
import json
import os
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


def create_sample_tables():
    """创建示例数据表"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 创建销售数据表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sales_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            region TEXT,
            product_name TEXT,
            sales_amount REAL,
            quantity INTEGER,
            sale_date TEXT,
            salesperson TEXT
        )
    """)

    # 2. 创建交易明细表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transaction_detail (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_code TEXT,
            transaction_code TEXT,
            auto_total INTEGER,
            trigger_total INTEGER,
            auto_passed INTEGER,
            pass_rate REAL,
            stat_date TEXT
        )
    """)

    # 3. 创建用户活跃表
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_name TEXT,
            login_date TEXT,
            active_minutes INTEGER,
            action_count INTEGER,
            department TEXT
        )
    """)

    conn.commit()
    return conn


def generate_sales_data(conn):
    """生成销售数据"""
    cursor = conn.cursor()

    # 清空旧数据
    cursor.execute("DELETE FROM sales_data")

    regions = ["华北", "华东", "华南", "西南", "华中"]
    products = ["产品A", "产品B", "产品C", "产品D", "产品E"]
    salespersons = ["张三", "李四", "王五", "赵六", "刘七", "陈八", "周九", "吴十"]

    # 生成最近30天的数据
    base_date = datetime.now()
    data = []

    for day_offset in range(30):
        date = base_date - timedelta(days=day_offset)
        date_str = date.strftime("%Y-%m-%d")

        for _ in range(random.randint(15, 30)):
            region = random.choice(regions)
            product = random.choice(products)
            salesperson = random.choice(salespersons)
            quantity = random.randint(1, 100)
            unit_price = random.uniform(10, 500)
            sales_amount = round(quantity * unit_price, 2)

            data.append((
                region, product, sales_amount, quantity,
                date_str, salesperson
            ))

    cursor.executemany("""
        INSERT INTO sales_data (region, product_name, sales_amount, quantity, sale_date, salesperson)
        VALUES (?, ?, ?, ?, ?, ?)
    """, data)

    conn.commit()
    print(f"  - 销售数据表: 已生成 {len(data)} 条记录")


def generate_transaction_data(conn):
    """生成交易明细数据"""
    cursor = conn.cursor()

    # 清空旧数据
    cursor.execute("DELETE FROM transaction_detail")

    branch_codes = ["B001", "B002", "B003", "B004", "B005", "B006", "B007", "B008"]
    transaction_codes = ["TX001", "TX002", "TX003", "TX004", "TX005"]

    base_date = datetime.now()
    data = []

    for day_offset in range(60):
        date = base_date - timedelta(days=day_offset)
        date_str = date.strftime("%Y-%m-%d")

        for branch in branch_codes:
            for tx_code in transaction_codes:
                auto_total = random.randint(100, 10000)
                trigger_total = random.randint(50, auto_total)
                auto_passed = random.randint(0, trigger_total)
                pass_rate = round((auto_passed / auto_total * 100) if auto_total > 0 else 0, 2)

                data.append((
                    branch, tx_code, auto_total, trigger_total,
                    auto_passed, pass_rate, date_str
                ))

    cursor.executemany("""
        INSERT INTO transaction_detail (branch_code, transaction_code, auto_total, trigger_total, auto_passed, pass_rate, stat_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, data)

    conn.commit()
    print(f"  - 交易明细表: 已生成 {len(data)} 条记录")


def generate_user_activity_data(conn):
    """生成用户活跃数据"""
    cursor = conn.cursor()

    # 清空旧数据
    cursor.execute("DELETE FROM user_activity")

    departments = ["研发部", "销售部", "市场部", "运维部", "财务部", "人力资源部"]

    base_date = datetime.now()
    data = []

    for day_offset in range(30):
        date = base_date - timedelta(days=day_offset)
        date_str = date.strftime("%Y-%m-%d")

        for user_num in range(1, 21):
            user_id = f"U{user_num:04d}"
            user_name = f"用户{user_num}"
            department = random.choice(departments)
            active_minutes = random.randint(30, 480)
            action_count = random.randint(10, 500)

            data.append((
                user_id, user_name, date_str, active_minutes,
                action_count, department
            ))

    cursor.executemany("""
        INSERT INTO user_activity (user_id, user_name, login_date, active_minutes, action_count, department)
        VALUES (?, ?, ?, ?, ?, ?)
    """, data)

    conn.commit()
    print(f"  - 用户活跃表: 已生成 {len(data)} 条记录")


def create_sample_queries(conn):
    """创建示例查询配置"""
    cursor = conn.cursor()

    # 清空旧查询
    cursor.execute("DELETE FROM saved_queries")

    queries = [
        {
            "display_name": "销售日报",
            "sql_text": """SELECT
    region AS "地区",
    product_name AS "产品",
    SUM(sales_amount) AS "销售额",
    SUM(quantity) AS "销售数量",
    sale_date AS "销售日期"
FROM sales_data
WHERE sale_date = :p_date
GROUP BY region, product_name, sale_date
ORDER BY SUM(sales_amount) DESC""",
            "parameters": [
                {"name": "p_date", "label": "销售日期", "type": "date"}
            ]
        },
        {
            "display_name": "销售汇总（月度）",
            "sql_text": """SELECT
    region AS "地区",
    product_name AS "产品",
    salesperson AS "销售人员",
    ROUND(SUM(sales_amount), 2) AS "总销售额",
    SUM(quantity) AS "总数量",
    AVG(sales_amount / quantity) AS "平均单价"
FROM sales_data
WHERE sale_date BETWEEN :p_start_date AND :p_end_date
GROUP BY region, product_name, salesperson
ORDER BY SUM(sales_amount) DESC""",
            "parameters": [
                {"name": "p_start_date", "label": "开始日期", "type": "date"},
                {"name": "p_end_date", "label": "结束日期", "type": "date"}
            ]
        },
        {
            "display_name": "交易通过率分析",
            "sql_text": """SELECT
    branch_code AS "机构号",
    transaction_code AS "交易码",
    SUM(auto_total) AS "全自动交易总量",
    SUM(trigger_total) AS "触发交易总量",
    SUM(auto_passed) AS "全自动通过量",
    ROUND(AVG(pass_rate), 2) AS "平均通过率",
    stat_date AS "统计日期"
FROM transaction_detail
WHERE stat_date = :p_date
GROUP BY branch_code, transaction_code, stat_date
ORDER BY SUM(auto_total) DESC""",
            "parameters": [
                {"name": "p_date", "label": "统计日期", "type": "date"}
            ]
        },
        {
            "display_name": "用户活跃度统计",
            "sql_text": """SELECT
    department AS "部门",
    user_name AS "用户名",
    SUM(active_minutes) AS "活跃时长(分钟)",
    SUM(action_count) AS "操作次数",
    COUNT(DISTINCT login_date) AS "登录天数",
    ROUND(AVG(active_minutes), 1) AS "日均活跃时长"
FROM user_activity
WHERE login_date BETWEEN :p_start_date AND :p_end_date
GROUP BY department, user_name
ORDER BY SUM(action_count) DESC""",
            "parameters": [
                {"name": "p_start_date", "label": "开始日期", "type": "date"},
                {"name": "p_end_date", "label": "结束日期", "type": "date"}
            ]
        },
        {
            "display_name": "各地区销售排名",
            "sql_text": """SELECT
    region AS "地区",
    COUNT(*) AS "订单数",
    ROUND(SUM(sales_amount), 2) AS "总销售额",
    ROUND(AVG(sales_amount), 2) AS "平均订单金额",
    SUM(quantity) AS "总销量",
    sale_date AS "日期"
FROM sales_data
WHERE sale_date = :p_date
GROUP BY region, sale_date
ORDER BY SUM(sales_amount) DESC""",
            "parameters": [
                {"name": "p_date", "label": "日期", "type": "date"}
            ]
        },
        {
            "display_name": "产品销售排行（无参数）",
            "sql_text": """SELECT
    product_name AS "产品名称",
    COUNT(*) AS "销售次数",
    ROUND(SUM(sales_amount), 2) AS "总销售额",
    SUM(quantity) AS "总销量",
    ROUND(AVG(sales_amount), 2) AS "平均单价"
FROM sales_data
GROUP BY product_name
ORDER BY SUM(sales_amount) DESC""",
            "parameters": []
        }
    ]

    for query in queries:
        cursor.execute("""
            INSERT INTO saved_queries (display_name, sql_text, parameters)
            VALUES (?, ?, ?)
        """, (
            query["display_name"],
            query["sql_text"],
            json.dumps(query["parameters"], ensure_ascii=False)
        ))

    conn.commit()
    print(f"  - 查询配置: 已创建 {len(queries)} 个示例查询")


def main():
    print("=" * 50)
    print("开始生成测试数据...")
    print("=" * 50)

    conn = create_sample_tables()
    print("\n[1] 创建数据表...")
    print("  - 销售数据表 (sales_data)")
    print("  - 交易明细表 (transaction_detail)")
    print("  - 用户活跃表 (user_activity)")

    print("\n[2] 生成测试数据...")
    generate_sales_data(conn)
    generate_transaction_data(conn)
    generate_user_activity_data(conn)

    print("\n[3] 创建示例查询配置...")
    create_sample_queries(conn)

    conn.close()

    print("\n" + "=" * 50)
    print("测试数据生成完成！")
    print("=" * 50)
    print("\n推荐测试参数:")
    print("  - 销售日报: 日期填 ", datetime.now().strftime("%Y-%m-%d"))
    print("  - 交易通过率: 日期填 ", datetime.now().strftime("%Y-%m-%d"))
    print("  - 月度汇总: 开始日期填 ", (datetime.now().replace(day=1)).strftime("%Y-%m-%d"))
    print("            结束日期填 ", datetime.now().strftime("%Y-%m-%d"))


if __name__ == "__main__":
    main()
