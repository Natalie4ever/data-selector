"""
认证模块
- 密码哈希/验证 (passlib + bcrypt / SHA-256 前端哈希)
- JWT Token 生成/验证 (python-jose)
- 用户查询（兼容内置 SQLite / 外部数据源）
"""

import os
import sqlite3
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

# ====================
# 配置
# ====================

# JWT 配置
AUTH_SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "change-me-to-a-real-secret-key")
AUTH_ALGORITHM = os.environ.get("AUTH_ALGORITHM", "HS256")
AUTH_EXPIRE_HOURS = int(os.environ.get("AUTH_EXPIRE_HOURS", "24"))

# 外部登录数据源配置
AUTH_DS_ID = os.environ.get("AUTH_DS_ID", "")
AUTH_TABLE = os.environ.get("AUTH_TABLE", "")
AUTH_EHR_COLUMN = os.environ.get("AUTH_EHR_COLUMN", "ehr_no")
AUTH_PWD_COLUMN = os.environ.get("AUTH_PWD_COLUMN", "password")

# 内置数据库路径
DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

# ====================
# 密码处理
# ====================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password_frontend(password: str, salt: str) -> str:
    """
    与前端一致的 SHA-256 哈希方式（加盐）
    前端使用 EHR 号作为盐值对密码进行 SHA-256 哈希后传输
    后端使用相同方式验证
    """
    combined = salt + password
    return hashlib.sha256(combined.encode('utf-8')).hexdigest()


def verify_password(plain_password: str, hashed_password: str, ehr_no: str = None) -> bool:
    """
    验证密码（支持双格式兼容）
    - bcrypt 格式（旧格式，60字符或以 $2 开头）：用 bcrypt 验证
    - SHA-256 格式（64字符十六进制，新格式）：直接比较（前端已哈希）
    - 也支持明文传入 → 自动计算哈希后比较
    """
    if not hashed_password:
        return False

    # bcrypt 格式（旧格式，60字符或以 $2 开头）
    if hashed_password.startswith('$2') or len(hashed_password) == 60:
        # 方式1：前端发送的是原始明文（bcrypt 验证）
        if pwd_context.verify(plain_password, hashed_password):
            return True
        # 方式2：前端误发了哈希值，尝试计算哈希后再比对（bcrypt 不等于 SHA-256，不会命中）
        return False

    # SHA-256 格式（64字符十六进制，新格式）
    if len(hashed_password) == 64 and all(c in '0123456789abcdef' for c in hashed_password.lower()):
        # 方式1：前端发送的是哈希值，直接比较
        if len(plain_password) == 64 and all(c in '0123456789abcdef' for c in plain_password.lower()):
            return plain_password.lower() == hashed_password.lower()
        # 方式2：前端发送的是明文，计算哈希后再比较（防御性）
        if ehr_no:
            computed = hash_password_frontend(plain_password, ehr_no)
            return computed.lower() == hashed_password.lower()
        return False

    # 其他未知格式，直接比较
    return plain_password == hashed_password


def get_password_hash(password: str) -> str:
    """对明文密码进行哈希（bcrypt，用于存储）"""
    return pwd_context.hash(password)


# ====================
# JWT Token
# ====================

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=AUTH_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, AUTH_SECRET_KEY, algorithm=AUTH_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """解码并验证 JWT Token"""
    try:
        payload = jwt.decode(token, AUTH_SECRET_KEY, algorithms=[AUTH_ALGORITHM])
        ehr_no: str = payload.get("sub")
        if ehr_no is None:
            return None
        return {"ehr_no": ehr_no}
    except JWTError:
        return None


# ====================
# 用户查询
# ====================

def use_external_auth_source() -> bool:
    """判断是否使用外部登录数据源"""
    return bool(AUTH_DS_ID and AUTH_TABLE)


def get_user_by_ehr(ehr_no: str) -> Optional[Dict[str, Any]]:
    """
    根据 EHR 号查询用户
    - 如果配置了外部数据源 → 从外部数据源查询
    - 否则 → 从内置 SQLite 查询
    """
    if use_external_auth_source():
        return _get_user_from_external(ehr_no)
    else:
        return _get_user_from_builtin(ehr_no)


def _get_user_from_builtin(ehr_no: str) -> Optional[Dict[str, Any]]:
    """从内置 SQLite users 表查询用户"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute(
            f"SELECT ehr_no, password_hash FROM users WHERE ehr_no = ?",
            (ehr_no,)
        )
        row = cursor.fetchone()
        if row:
            return {"ehr_no": row["ehr_no"], "password_hash": row["password_hash"]}
        return None
    finally:
        conn.close()


def _get_user_from_external(ehr_no: str) -> Optional[Dict[str, Any]]:
    """从外部数据源查询用户"""
    from backend.datasource_manager import build_connection

    try:
        conn = build_connection(AUTH_DS_ID)

        # 不同数据库的参数占位符不同
        db_type = _get_auth_ds_type()
        if db_type == "oracle":
            placeholder = ":ehr_no"
        elif db_type == "sqlserver":
            placeholder = "%s"
        else:
            placeholder = "?"

        sql = f"SELECT {AUTH_EHR_COLUMN}, {AUTH_PWD_COLUMN} FROM {AUTH_TABLE} WHERE {AUTH_EHR_COLUMN} = {placeholder}"

        if db_type == "oracle":
            cursor = conn.cursor()
            cursor.execute(sql, {"ehr_no": ehr_no})
            row = cursor.fetchone()
            if row:
                # Oracle 返回 tuple
                return {"ehr_no": row[0], "password_hash": row[1]}
        else:
            cursor = conn.execute(sql, (ehr_no,))
            row = cursor.fetchone()
            if row:
                if hasattr(row, 'keys'):
                    return {"ehr_no": row[AUTH_EHR_COLUMN], "password_hash": row[AUTH_PWD_COLUMN]}
                else:
                    return {"ehr_no": row[0], "password_hash": row[1]}

        return None
    except Exception as e:
        print(f"[AUTH] 外部数据源查询失败: {e}")
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _get_auth_ds_type() -> str:
    """获取认证数据源的数据库类型"""
    from backend.datasource_manager import load_datasources
    datasources = load_datasources()
    ds = next((d for d in datasources if d["id"] == AUTH_DS_ID), None)
    return ds.get("db_type", "sqlite") if ds else "sqlite"


# ====================
# 当前用户依赖
# ====================

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    FastAPI 依赖：从 Authorization Bearer Token 中获取当前用户
    用于保护需要登录的 API 接口
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    ehr_no = payload.get("ehr_no")
    if ehr_no is None:
        raise credentials_exception

    user = get_user_by_ehr(ehr_no)
    if user is None:
        raise credentials_exception

    return {"ehr_no": user["ehr_no"]}
