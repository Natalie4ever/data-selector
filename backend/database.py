import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)

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
    for col_def in [
        "column_config TEXT DEFAULT '[]'",
        "datasource_id TEXT DEFAULT NULL",
    ]:
        col_name = col_def.split()[0]
        try:
            conn.execute(f"ALTER TABLE saved_queries ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()
