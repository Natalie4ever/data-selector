import json
import sqlite3
import os
from typing import List, Optional
from backend.models import QueryCreate, QueryUpdate, QueryListItem, Parameter

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


def _get_conn():
    """创建配置了 row_factory 的 sqlite3 连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_PATH)

    # 创建表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            sql_text TEXT NOT NULL,
            parameters TEXT DEFAULT '[]',
            column_config TEXT DEFAULT '[]',
            datasource_id TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 兼容旧数据库：添加缺失的列
    for col_def, col_name in [
        ("column_config TEXT DEFAULT '[]'", "column_config"),
        ("datasource_id TEXT DEFAULT NULL", "datasource_id"),
    ]:
        try:
            conn.execute(f"ALTER TABLE saved_queries ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass  # 列已存在

    conn.commit()
    conn.close()


def create_query(query: QueryCreate) -> int:
    print(f"[DEBUG] create_query: datasource_id={query.datasource_id!r}")
    conn = _get_conn()
    cursor = conn.execute(
        """INSERT INTO saved_queries (display_name, sql_text, parameters, column_config, datasource_id)
           VALUES (?, ?, ?, ?, ?)""",
        (
            query.display_name,
            query.sql_text,
            json.dumps([p.model_dump() for p in query.parameters]),
            json.dumps([c.model_dump() for c in query.column_config]),
            query.datasource_id
        )
    )
    conn.commit()
    lastrowid = cursor.lastrowid
    conn.close()
    return lastrowid


def get_all_queries() -> List[QueryListItem]:
    conn = _get_conn()
    cursor = conn.execute(
        "SELECT id, display_name, parameters, datasource_id FROM saved_queries ORDER BY created_at DESC"
    )
    rows = cursor.fetchall()
    result = []
    for row in rows:
        params = json.loads(row["parameters"]) if row["parameters"] else []
        result.append(QueryListItem(
            id=row["id"],
            display_name=row["display_name"],
            parameters=[Parameter(**p) for p in params],
            datasource_id=row["datasource_id"]
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
    }
    conn.close()
    return result


def update_query(query_id: int, query: QueryUpdate) -> bool:
    print(f"[DEBUG] update_query: id={query_id}, datasource_id={query.datasource_id!r}")
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
