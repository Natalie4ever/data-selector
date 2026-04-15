"""
数据源管理模块 - 支持从环境变量加载多数据源配置
支持：SQLite, MySQL, PostgreSQL, Oracle, SQL Server
密码使用 AES-256-CBC 加密存储
"""

import os
import sqlite3
import base64
import hashlib
from typing import List, Dict, Optional, Any, Tuple

# 尝试使用 PyCryptodome (纯 Python，Windows 更容易安装)
USE_PYCRYPTODOME = False
try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
    USE_PYCRYPTODOME = True
except ImportError:
    pass


# 延迟加载的密钥（从环境变量读取）
_DECRYPT_KEY: Optional[bytes] = None
_DECRYPT_IV: Optional[bytes] = None
_DATASOURCES_CACHE: Optional[List[Dict]] = None


# ============================================================
# 密钥管理
# ============================================================

def _get_crypto_key() -> Tuple[Optional[bytes], Optional[bytes]]:
    """获取解密密钥，首次调用时从环境变量加载"""
    global _DECRYPT_KEY, _DECRYPT_IV
    if _DECRYPT_KEY is None:
        key_str = os.environ.get("DS_DECRYPT_KEY")
        iv_str = os.environ.get("DS_DECRYPT_IV")
        if key_str and iv_str:
            _DECRYPT_KEY = base64.b64decode(key_str)
            _DECRYPT_IV = base64.b64decode(iv_str)
    return _DECRYPT_KEY, _DECRYPT_IV


def _expand_key(key: bytes, length: int) -> bytes:
    """扩展密钥到指定长度，使用 hash 链"""
    result = bytearray()
    current = key
    while len(result) < length:
        current = hashlib.sha256(current).digest()
        take = min(len(current), length - len(result))
        result.extend(current[:take])
    return result


def decrypt_password(encrypted: str) -> str:
    """
    解密密码
    如果未配置密钥，直接返回原文（调试模式）
    使用降级模式时用简单的 XOR 混淆
    """
    key, iv = _get_crypto_key()
    if not key or not encrypted:
        return encrypted

    try:
        ct = base64.b64decode(encrypted)
        if USE_PYCRYPTODOME:
            cipher = AES.new(key, AES.MODE_CBC, iv)
            padded = cipher.decrypt(ct)
            plaintext = unpad(padded, 16).decode('utf-8')
            return plaintext
        else:
            # 降级：简单 XOR
            result = bytearray()
            extended_key = _expand_key(key, len(ct))
            for i in range(len(ct)):
                result.append(ct[i] ^ extended_key[i])
            return result.decode('utf-8')
    except Exception as e:
        raise ValueError(f"密码解密失败，请检查密钥配置: {e}")


def get_datasource_password(prefix: str) -> str:
    """获取指定数据源的实际密码（解密后）"""
    # 优先读取明文（调试用）
    raw_pass = os.environ.get(f"{prefix}_PASS")
    if raw_pass:
        return raw_pass

    # 读取密文并解密
    enc_pass = os.environ.get(f"{prefix}_PASS_ENC")
    if enc_pass:
        return decrypt_password(enc_pass)

    return ""


# ============================================================
# 数据源加载
# ============================================================

def load_datasources() -> List[Dict[str, Any]]:
    """
    从环境变量扫描所有数据源配置
    返回格式化的数据源列表（不含密码）
    """
    global _DATASOURCES_CACHE

    if _DATASOURCES_CACHE is not None:
        return _DATASOURCES_CACHE

    # 扫描所有 DS_ 开头的环境变量
    prefixes = set()
    for key in os.environ:
        if key.startswith("DS_") and "_" in key[3:]:
            # 提取前缀，如 DS_PROJ_A_NAME -> DS_PROJ_A
            parts = key.rsplit("_", 1)
            if len(parts) == 2 and parts[1] in [
                "NAME", "TYPE", "HOST", "PORT", "DB",
                "USER", "PASS", "PASS_ENC", "SID", "SERVICE"
            ]:
                prefixes.add(parts[0])

    datasources = []
    for prefix in sorted(prefixes):
        if prefix == "DS_DEFAULT":
            continue  # 内置数据库单独处理

        name = os.environ.get(f"{prefix}_NAME")
        db_type = os.environ.get(f"{prefix}_TYPE")

        if not name or not db_type:
            continue

        ds = {
            "id": prefix,
            "name": name,
            "db_type": db_type,
            "host": os.environ.get(f"{prefix}_HOST"),
            "port": _parse_port(os.environ.get(f"{prefix}_PORT")),
            "database": os.environ.get(f"{prefix}_DB"),
            "sid": os.environ.get(f"{prefix}_SID"),        # Oracle 专用
            "service": os.environ.get(f"{prefix}_SERVICE"),  # Oracle 专用
            "username": os.environ.get(f"{prefix}_USER"),
            "has_password": bool(
                os.environ.get(f"{prefix}_PASS") or
                os.environ.get(f"{prefix}_PASS_ENC")
            ),
        }
        datasources.append(ds)

    _DATASOURCES_CACHE = datasources
    return datasources


def _parse_port(port_str: Optional[str]) -> Optional[int]:
    """解析端口号"""
    if not port_str:
        return None
    try:
        return int(port_str)
    except ValueError:
        return None


def clear_cache():
    """清除数据源缓存（配置变更后调用）"""
    global _DATASOURCES_CACHE
    _DATASOURCES_CACHE = None


# ============================================================
# 连接创建
# ============================================================

def build_connection(ds_id: str):
    """
    根据数据源 ID 创建数据库连接
    返回连接对象（调用方负责关闭）
    """
    print(f"[DEBUG] build_connection called with ds_id={ds_id!r}")

    if ds_id == "DS_DEFAULT" or not ds_id:
        # 内置 SQLite
        from backend.database import DB_PATH
        print(f"[DEBUG] Using DEFAULT SQLite: {DB_PATH}")
        print(f"[DEBUG] File exists: {os.path.exists(DB_PATH)}")
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    # 外部数据源
    datasources = load_datasources()
    ds = next((d for d in datasources if d["id"] == ds_id), None)

    if not ds:
        raise ValueError(f"数据源不存在: {ds_id}")

    db_type = ds["db_type"]
    password = get_datasource_password(ds_id)

    if db_type == "sqlite":
        db_path = ds["database"]
        print(f"[DEBUG] SQLite db_path={db_path!r}")
        print(f"[DEBUG] SQLite absolute path={os.path.abspath(db_path)!r}")
        print(f"[DEBUG] SQLite file exists={os.path.exists(db_path)}, is_file={os.path.isfile(db_path) if db_path else False}")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    elif db_type == "mysql":
        try:
            import pymysql
        except ImportError:
            raise RuntimeError("未安装 pymysql，请运行: pip install pymysql")
        return pymysql.connect(
            host=ds["host"] or "localhost",
            port=ds["port"] or 3306,
            user=ds["username"] or "",
            password=password,
            database=ds["database"] or "",
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )

    elif db_type == "postgres":
        try:
            import psycopg2
        except ImportError:
            raise RuntimeError("未安装 psycopg2，请运行: pip install psycopg2-binary")
        return psycopg2.connect(
            host=ds["host"] or "localhost",
            port=ds["port"] or 5432,
            user=ds["username"] or "",
            password=password,
            database=ds["database"] or "",
        )

    elif db_type == "oracle":
        try:
            import oracledb
        except ImportError:
            raise RuntimeError("未安装 oracledb，请运行: pip install oracledb")
        # Oracle 连接：优先用 SERVICE_NAME，其次 SID
        dsn = None
        if ds.get("service"):
            dsn = oracledb.makedsn(
                host=ds["host"] or "localhost",
                port=ds["port"] or 1521,
                service_name=ds["service"]
            )
        elif ds.get("sid"):
            dsn = oracledb.makedsn(
                host=ds["host"] or "localhost",
                port=ds["port"] or 1521,
                sid=ds["sid"]
            )
        else:
            raise ValueError("Oracle 数据源必须配置 SID 或 SERVICE")
        return oracledb.connect(
            user=ds["username"] or "",
            password=password,
            dsn=dsn,
        )

    elif db_type == "sqlserver":
        try:
            import pymssql
        except ImportError:
            raise RuntimeError("未安装 pymssql，请运行: pip install pymssql")
        return pymssql.connect(
            server=ds["host"] or "localhost",
            port=ds["port"] or 1433,
            user=ds["username"] or "",
            password=password,
            database=ds["database"] or "",
            charset="utf8",
        )

    else:
        raise ValueError(f"不支持的数据库类型: {db_type}")


def test_connection(ds_id: str) -> Tuple[bool, str]:
    """
    测试数据源连接
    返回: (success: bool, message: str)
    """
    try:
        conn = build_connection(ds_id)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        return True, "连接成功"
    except Exception as e:
        return False, str(e)


def get_connection_type(ds_id: str) -> Optional[str]:
    """获取连接类型"""
    if ds_id == "DS_DEFAULT" or not ds_id:
        return "sqlite"

    datasources = load_datasources()
    ds = next((d for d in datasources if d["id"] == ds_id), None)
    return ds["db_type"] if ds else None
