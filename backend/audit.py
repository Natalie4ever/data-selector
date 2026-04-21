"""
审计日志模块
- 记录用户的增删改查操作
- 查询审计日志
- 白名单权限校验
"""

import json
import sqlite3
import os
from typing import List, Optional, Dict, Any
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")


def _ensure_logs_dir():
    """确保日志目录存在"""
    if not os.path.exists(LOGS_DIR):
        os.makedirs(LOGS_DIR, exist_ok=True)


def _write_audit_log_file(record: dict):
    """将审计日志写入以日期命名的文件中"""
    _ensure_logs_dir()
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = os.path.join(LOGS_DIR, f"audit_{today}.log")
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _get_conn():
    """创建配置了 row_factory 的 sqlite3 连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_audit_tables():
    """初始化审计相关表"""
    conn = sqlite3.connect(DB_PATH)

    # 创建 operation_logs 表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS operation_logs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ehr_no        TEXT,
            action        TEXT NOT NULL,
            target_type   TEXT,
            target_id     TEXT,
            detail        TEXT DEFAULT '{}',
            before_value  TEXT,
            ip_address    TEXT,
            user_agent    TEXT,
            status        TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 兼容旧数据库：添加缺失的列
    for col_def in [
        "detail TEXT DEFAULT '{}'",
        "before_value TEXT",
        "ip_address TEXT",
        "user_agent TEXT",
        "error_message TEXT",
    ]:
        col_name = col_def.split()[0]
        try:
            conn.execute(f"ALTER TABLE operation_logs ADD COLUMN {col_def}")
        except sqlite3.OperationalError:
            pass  # 列已存在

    # 创建 app_config 表（用于存储系统配置，如白名单）
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_config (
            key   TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # 初始化默认白名单（如果不存在）
    cursor = conn.execute(
        "SELECT value FROM app_config WHERE key = 'audit_viewer_whitelist'"
    )
    row = cursor.fetchone()
    if not row:
        default_whitelist = ["1234567", "1234568"]
        conn.execute(
            "INSERT INTO app_config (key, value) VALUES (?, ?)",
            ("audit_viewer_whitelist", json.dumps(default_whitelist))
        )
        print("[AUDIT] 默认审计查看白名单已创建: " + ", ".join(default_whitelist))

    conn.commit()
    conn.close()


def log_operation(
    action: str,
    target_type: str,
    target_id: str = None,
    detail: dict = None,
    before_value: dict = None,
    status: str = "success",
    error_message: str = None,
    ip_address: str = None,
    user_agent: str = None,
    ehr_no: str = None
) -> int:
    """
    记录一条操作日志

    Args:
        action: 操作类型，如 QUERY_CREATE, QUERY_UPDATE, QUERY_DELETE,
                QUERY_EXECUTE, LOGIN, LOGOUT, DATASOURCE_TEST
        target_type: 对象类型，如 query, auth, datasource
        target_id: 对象标识
        detail: 详细信息（dict，会序列化为 JSON）
        before_value: 修改前的完整内容（仅 update 场景）
        status: success / failed
        error_message: 错误信息
        ip_address: 请求 IP
        user_agent: 浏览器 UA
        ehr_no: 操作人 EHR 号

    Returns:
        新增记录的 id
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        """INSERT INTO operation_logs
           (ehr_no, action, target_type, target_id, detail, before_value,
            ip_address, user_agent, status, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            ehr_no,
            action,
            target_type,
            target_id,
            json.dumps(detail or {}, ensure_ascii=False),
            json.dumps(before_value, ensure_ascii=False) if before_value else None,
            ip_address,
            user_agent,
            status,
            error_message,
        )
    )
    conn.commit()
    log_id = cursor.lastrowid
    created_at = datetime.now().isoformat()
    conn.close()

    # 同时写入日志文件
    file_record = {
        "id": log_id,
        "timestamp": created_at,
        "ehr_no": ehr_no,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "detail": detail or {},
        "before_value": before_value,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "status": status,
        "error_message": error_message,
    }
    try:
        _write_audit_log_file(file_record)
    except Exception as e:
        # 日志文件写入失败不影响主流程，只打印警告
        print(f"[AUDIT] 写入日志文件失败: {e}")

    return log_id


def get_audit_logs(
    page: int = 1,
    page_size: int = 20,
    action: str = None,
    start_date: str = None,
    end_date: str = None,
) -> Dict[str, Any]:
    """
    分页查询审计日志

    Args:
        page: 页码（从 1 开始）
        page_size: 每页条数
        action: 筛选操作类型
        start_date: 开始日期（YYYY-MM-DD）
        end_date: 结束日期（YYYY-MM-DD）

    Returns:
        {"logs": [...], "total": N, "page": page, "page_size": page_size}
    """
    conn = _get_conn()

    conditions = []
    params = []

    if action:
        conditions.append("action = ?")
        params.append(action)
    if start_date:
        conditions.append("date(created_at) >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("date(created_at) <= ?")
        params.append(end_date)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # 查询总数
    cursor = conn.execute(
        f"SELECT COUNT(*) as cnt FROM operation_logs WHERE {where_clause}",
        params
    )
    total = cursor.fetchone()["cnt"]

    # 分页查询
    offset = (page - 1) * page_size
    cursor = conn.execute(
        f"""SELECT id, ehr_no, action, target_type, target_id, detail,
                   before_value, ip_address, user_agent, status,
                   error_message, created_at
            FROM operation_logs
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?""",
        params + [page_size, offset]
    )
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for row in rows:
        logs.append({
            "id": row["id"],
            "ehr_no": row["ehr_no"],
            "action": row["action"],
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "detail": json.loads(row["detail"]) if row["detail"] else {},
            "before_value": json.loads(row["before_value"]) if row["before_value"] else None,
            "ip_address": row["ip_address"],
            "user_agent": row["user_agent"],
            "status": row["status"],
            "error_message": row["error_message"],
            "created_at": row["created_at"],
        })

    return {
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def can_view_audit_logs(ehr_no: str) -> bool:
    """
    检查用户是否有权限查看审计日志

    Args:
        ehr_no: 当前用户的 EHR 号

    Returns:
        True if user is in the whitelist
    """
    if not ehr_no:
        return False

    conn = _get_conn()
    cursor = conn.execute(
        "SELECT value FROM app_config WHERE key = 'audit_viewer_whitelist'"
    )
    row = cursor.fetchone()
    conn.close()

    if not row or not row["value"]:
        return False

    try:
        whitelist = json.loads(row["value"])
        return ehr_no in whitelist
    except (json.JSONDecodeError, TypeError):
        return False


def get_audit_viewer_whitelist() -> List[str]:
    """获取审计查看白名单"""
    conn = _get_conn()
    cursor = conn.execute(
        "SELECT value FROM app_config WHERE key = 'audit_viewer_whitelist'"
    )
    row = cursor.fetchone()
    conn.close()

    if not row or not row["value"]:
        return []

    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return []


def update_audit_viewer_whitelist(whitelist: List[str]) -> bool:
    """更新审计查看白名单"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)",
        ("audit_viewer_whitelist", json.dumps(whitelist, ensure_ascii=False))
    )
    conn.commit()
    conn.close()
    return True
