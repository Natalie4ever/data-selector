import json
import sqlite3
import os
from typing import List, Optional
from backend.models import QueryCreate, QueryUpdate, QueryListItem, Parameter
from backend.auth import get_password_hash, use_external_auth_source, hash_password_frontend
from backend import audit

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

DEFAULT_USERS = [
    ("1234567", "Password01!"),
    ("1234568", "Password01!"),
]


def _get_conn():
    """创建配置了 row_factory 的 sqlite3 连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_PATH)

    # 创建 saved_queries 表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            sql_text TEXT NOT NULL,
            parameters TEXT DEFAULT '[]',
            column_config TEXT DEFAULT '[]',
            datasource_id TEXT DEFAULT NULL,
            menu_item_id INTEGER DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
        )
    """)

    # 兼容旧数据库：添加缺失的列
    for col_def, col_name in [
        ("column_config TEXT DEFAULT '[]'", "column_config"),
        ("datasource_id TEXT DEFAULT NULL", "datasource_id"),
        ("menu_item_id INTEGER DEFAULT NULL", "menu_item_id"),
    ]:
        try:
            conn.execute(f"ALTER TABLE saved_queries ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass  # 列已存在

    # 创建 menu_categories 表（一级菜单）
    conn.execute("""
        CREATE TABLE IF NOT EXISTS menu_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            visible_ehrs TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 兼容旧数据库：添加缺失的列
    try:
        conn.execute("ALTER TABLE menu_categories ADD COLUMN sort_order INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE menu_categories ADD COLUMN visible_ehrs TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
        pass

    # 创建 menu_items 表（二级菜单）
    conn.execute("""
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE
        )
    """)

    # 兼容旧数据库：添加缺失的列
    try:
        conn.execute("ALTER TABLE menu_items ADD COLUMN sort_order INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # 创建索引
    conn.execute("CREATE INDEX IF NOT EXISTS idx_saved_queries_menu_item ON saved_queries(menu_item_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_ehr_no ON users(ehr_no)")

    conn.commit()
    conn.close()

    # 创建默认用户（仅在未配置外部数据源且无用户时）
    _ensure_default_user()

    # 初始化审计日志表
    audit.init_audit_tables()


def _ensure_default_user():
    """确保默认用户存在，旧格式密码自动迁移到新格式"""
    if use_external_auth_source():
        # 使用外部数据源，跳过内置默认用户
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    for ehr_no, password in DEFAULT_USERS:
        cursor = conn.execute("SELECT id, password_hash FROM users WHERE ehr_no = ?", (ehr_no,))
        row = cursor.fetchone()
        if row:
            # 用户已存在，检查是否需要迁移旧格式密码
            ph = row["password_hash"] or ""
            if ph.startswith("$2") or len(ph) == 60:
                # 旧 bcrypt 格式，迁移到 SHA-256 前端哈希格式
                new_hash = hash_password_frontend(password, ehr_no)
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE ehr_no = ?",
                    (new_hash, ehr_no)
                )
                conn.commit()
                print(f"[AUTH] 默认用户密码已迁移: EHR={ehr_no}")
            continue

        # 创建默认用户（使用与前端一致的 SHA-256 加盐哈希）
        password_hash = hash_password_frontend(password, ehr_no)
        conn.execute(
            "INSERT INTO users (ehr_no, password_hash) VALUES (?, ?)",
            (ehr_no, password_hash)
        )
        conn.commit()
        print(f"[AUTH] 默认用户已创建: EHR={ehr_no}, 密码={password}")

    conn.close()


def create_query(query: QueryCreate, menu_item_id: int = None) -> int:
    print(f"[DEBUG] create_query: datasource_id={query.datasource_id!r}, menu_item_id={menu_item_id}")
    conn = _get_conn()
    cursor = conn.execute(
        """INSERT INTO saved_queries (display_name, sql_text, parameters, column_config, datasource_id, menu_item_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            query.display_name,
            query.sql_text,
            json.dumps([p.model_dump() for p in query.parameters]),
            json.dumps([c.model_dump() for c in query.column_config]),
            query.datasource_id,
            menu_item_id
        )
    )
    conn.commit()
    lastrowid = cursor.lastrowid
    conn.close()
    return lastrowid


def get_all_queries() -> List[QueryListItem]:
    conn = _get_conn()
    cursor = conn.execute(
        "SELECT id, display_name, parameters, datasource_id, menu_item_id FROM saved_queries ORDER BY created_at DESC"
    )
    rows = cursor.fetchall()
    result = []
    for row in rows:
        params = json.loads(row["parameters"]) if row["parameters"] else []
        result.append(QueryListItem(
            id=row["id"],
            display_name=row["display_name"],
            parameters=[Parameter(**p) for p in params],
            datasource_id=row["datasource_id"],
            menu_item_id=row["menu_item_id"]
        ))
    conn.close()
    return result


def get_query_by_id(query_id: int) -> Optional[dict]:
    conn = _get_conn()
    cursor = conn.execute(
        "SELECT * FROM saved_queries WHERE id = ?",
        (query_id,)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    params = json.loads(row["parameters"]) if row["parameters"] else []
    column_config = json.loads(row["column_config"]) if row["column_config"] else []

    result = {
        "id": row["id"],
        "display_name": row["display_name"],
        "sql_text": row["sql_text"],
        "parameters": [Parameter(**p) for p in params],
        "column_config": column_config,
        "datasource_id": row["datasource_id"],
        "menu_item_id": row["menu_item_id"],
    }
    conn.close()
    return result


def update_query(query_id: int, query: QueryUpdate, menu_item_id: int = None) -> bool:
    print(f"[DEBUG] update_query: id={query_id}, datasource_id={query.datasource_id!r}, menu_item_id={menu_item_id}")
    conn = _get_conn()
    updates = []
    values = []

    if query.display_name is not None:
        updates.append("display_name = ?")
        values.append(query.display_name)
    if query.sql_text is not None:
        updates.append("sql_text = ?")
        values.append(query.sql_text)
    if query.parameters is not None:
        updates.append("parameters = ?")
        values.append(json.dumps([p.model_dump() for p in query.parameters]))
    if query.column_config is not None:
        updates.append("column_config = ?")
        values.append(json.dumps([c.model_dump() for c in query.column_config]))
    # datasource_id: None 表示使用内置数据库，显式更新为 NULL
    updates.append("datasource_id = ?")
    values.append(query.datasource_id)
    # menu_item_id: 使用传入的值（可以为 None 表示未分类）
    if menu_item_id is not None:
        updates.append("menu_item_id = ?")
        values.append(menu_item_id)

    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        values.append(query_id)
        conn.execute(
            f"UPDATE saved_queries SET {', '.join(updates)} WHERE id = ?",
            values
        )
        conn.commit()
        conn.close()
        return True

    conn.close()
    return False


def delete_query(query_id: int) -> bool:
    conn = _get_conn()
    cursor = conn.execute("DELETE FROM saved_queries WHERE id = ?", (query_id,))
    conn.commit()
    rowcount = cursor.rowcount
    conn.close()
    return rowcount > 0


# ==================== 菜单管理 ====================

def get_menu_tree(ehr_no: str = None, is_admin: bool = False) -> List[dict]:
    """
    获取菜单树，包含一级菜单、二级菜单和查询

    Args:
        ehr_no: 当前用户 EHR 号
        is_admin: 是否为白名单管理员

    Returns:
        菜单树列表
    """
    conn = _get_conn()

    # 获取一级菜单（管理员可见全部，普通用户按权限过滤）
    if is_admin:
        cat_cursor = conn.execute(
            "SELECT id, name, sort_order, visible_ehrs FROM menu_categories ORDER BY sort_order, id"
        )
    else:
        cat_cursor = conn.execute(
            """SELECT id, name, sort_order, visible_ehrs FROM menu_categories
               WHERE visible_ehrs IS NULL OR visible_ehrs = '' OR visible_ehrs LIKE ?
               ORDER BY sort_order, id""",
            (f"%\"{ehr_no}\"%",)
        )

    categories = []
    for cat_row in cat_cursor:
        cat_id = cat_row["id"]
        visible_ehrs = cat_row["visible_ehrs"]

        # 非管理员：检查 EHR 号是否在白名单内（如果 visible_ehrs 配置了的话）
        if not is_admin and visible_ehrs:
            try:
                ehrs = json.loads(visible_ehrs)
                if ehr_no not in ehrs:
                    continue
            except json.JSONDecodeError:
                pass

        # 获取二级菜单
        item_cursor = conn.execute(
            """SELECT id, name, sort_order FROM menu_items
               WHERE category_id = ? ORDER BY sort_order, id""",
            (cat_id,)
        )
        items = []
        for item_row in item_cursor:
            item_id = item_row["id"]

            # 获取该二级菜单下的查询
            query_cursor = conn.execute(
                """SELECT id, display_name, parameters FROM saved_queries
                   WHERE menu_item_id = ? ORDER BY created_at DESC""",
                (item_id,)
            )
            queries = []
            for q_row in query_cursor:
                params = json.loads(q_row["parameters"]) if q_row["parameters"] else []
                queries.append({
                    "id": q_row["id"],
                    "display_name": q_row["display_name"],
                    "parameters": [Parameter(**p) for p in params]
                })

            items.append({
                "id": item_row["id"],
                "name": item_row["name"],
                "sort_order": item_row["sort_order"],
                "queries": queries
            })

        # 获取未分类的查询（menu_item_id 为 NULL）
        uncategorized_cursor = conn.execute(
            """SELECT id, display_name, parameters FROM saved_queries
               WHERE menu_item_id IS NULL ORDER BY created_at DESC"""
        )
        uncategorized = []
        for q_row in uncategorized_cursor:
            params = json.loads(q_row["parameters"]) if q_row["parameters"] else []
            uncategorized.append({
                "id": q_row["id"],
                "display_name": q_row["display_name"],
                "parameters": [Parameter(**p) for p in params]
            })

        categories.append({
            "id": cat_row["id"],
            "name": cat_row["name"],
            "sort_order": cat_row["sort_order"],
            "visible_ehrs": visible_ehrs,
            "items": items,
            "uncategorized": uncategorized
        })

    conn.close()
    return categories


# 一级菜单 CRUD

def create_category(name: str, sort_order: int = 0, visible_ehrs: list = None) -> int:
    conn = _get_conn()
    cursor = conn.execute(
        """INSERT INTO menu_categories (name, sort_order, visible_ehrs)
           VALUES (?, ?, ?)""",
        (name, sort_order, json.dumps(visible_ehrs, ensure_ascii=False) if visible_ehrs else None)
    )
    conn.commit()
    lastrowid = cursor.lastrowid
    conn.close()
    return lastrowid


def update_category(category_id: int, name: str = None, sort_order: int = None, visible_ehrs: list = None) -> bool:
    conn = _get_conn()
    updates = []
    values = []

    if name is not None:
        updates.append("name = ?")
        values.append(name)
    if sort_order is not None:
        updates.append("sort_order = ?")
        values.append(sort_order)
    if visible_ehrs is not None:
        updates.append("visible_ehrs = ?")
        values.append(json.dumps(visible_ehrs, ensure_ascii=False) if visible_ehrs else None)

    if updates:
        values.append(category_id)
        conn.execute(
            f"UPDATE menu_categories SET {', '.join(updates)} WHERE id = ?",
            values
        )
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False


def delete_category(category_id: int) -> bool:
    """删除一级菜单，同时删除其下所有二级菜单（查询的 menu_item_id 会自动设为 NULL）"""
    conn = _get_conn()
    cursor = conn.execute("DELETE FROM menu_categories WHERE id = ?", (category_id,))
    conn.commit()
    rowcount = cursor.rowcount
    conn.close()
    return rowcount > 0


# 二级菜单 CRUD

def create_menu_item(category_id: int, name: str, sort_order: int = 0) -> int:
    conn = _get_conn()
    cursor = conn.execute(
        """INSERT INTO menu_items (category_id, name, sort_order) VALUES (?, ?, ?)""",
        (category_id, name, sort_order)
    )
    conn.commit()
    lastrowid = cursor.lastrowid
    conn.close()
    return lastrowid


def update_menu_item(item_id: int, name: str = None, sort_order: int = None) -> bool:
    conn = _get_conn()
    updates = []
    values = []

    if name is not None:
        updates.append("name = ?")
        values.append(name)
    if sort_order is not None:
        updates.append("sort_order = ?")
        values.append(sort_order)

    if updates:
        values.append(item_id)
        conn.execute(
            f"UPDATE menu_items SET {', '.join(updates)} WHERE id = ?",
            values
        )
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False


def delete_menu_item(item_id: int) -> bool:
    """删除二级菜单，查询的 menu_item_id 会自动设为 NULL"""
    conn = _get_conn()
    cursor = conn.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    conn.commit()
    rowcount = cursor.rowcount
    conn.close()
    return rowcount > 0


# 查询的菜单分配

def update_query_menu_item(query_id: int, menu_item_id: int = None) -> bool:
    """更新查询的菜单归属"""
    conn = _get_conn()
    conn.execute(
        "UPDATE saved_queries SET menu_item_id = ? WHERE id = ?",
        (menu_item_id, query_id)
    )
    conn.commit()
    conn.close()
    return True
