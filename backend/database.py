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
            menu_item_id INTEGER DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
        )
    """)

    # 兼容旧数据库：添加缺失的列
    for col_def in [
        "column_config TEXT DEFAULT '[]'",
        "datasource_id TEXT DEFAULT NULL",
        "menu_item_id INTEGER DEFAULT NULL",
    ]:
        col_name = col_def.split()[0]
        try:
            conn.execute(f"ALTER TABLE saved_queries ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass

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

    conn.commit()
    conn.close()
