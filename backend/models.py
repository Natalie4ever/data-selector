from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class Parameter(BaseModel):
    name: str
    label: str
    type: str = "text"  # text, date, number


class ColumnConfig(BaseModel):
    name: str
    agg_type: str = "SUM"  # SUM, AVG, COUNT, MAX, MIN, 不聚合, expression
    agg_expr: Optional[str] = None  # 当 agg_type=expression 时使用，如 "SUM(a)/SUM(b)"


class QueryCreate(BaseModel):
    display_name: str
    sql_text: str
    parameters: List[Parameter] = []
    column_config: List[ColumnConfig] = []
    datasource_id: Optional[str] = None  # 数据源 ID
    menu_item_id: Optional[int] = None  # 所属二级菜单 ID


class QueryUpdate(BaseModel):
    display_name: Optional[str] = None
    sql_text: Optional[str] = None
    parameters: Optional[List[Parameter]] = None
    column_config: Optional[List[ColumnConfig]] = None
    datasource_id: Optional[str] = None  # 数据源 ID
    menu_item_id: Optional[int] = None  # 所属二级菜单 ID


class QueryOut(BaseModel):
    id: int
    display_name: str
    sql_text: str
    parameters: str  # JSON string
    column_config: str  # JSON string
    datasource_id: Optional[str] = None  # 数据源 ID
    created_at: datetime
    updated_at: datetime


class QueryListItem(BaseModel):
    id: int
    display_name: str
    parameters: List[Parameter]
    datasource_id: Optional[str] = None  # 数据源 ID
    menu_item_id: Optional[int] = None  # 所属二级菜单 ID


class ExecuteRequest(BaseModel):
    params: Dict[str, Any] = {}
    time_filters: Dict[str, Any] = {}  # 时间筛选 { col: { start, end } }


class ExecuteResponse(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    types: Dict[str, Optional[int]]  # 字段名 -> 类型编码


# ====================
# 新增：数据源相关模型
# ====================

class Datasource(BaseModel):
    id: str
    name: str
    db_type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    sid: Optional[str] = None            # Oracle
    service: Optional[str] = None        # Oracle
    username: Optional[str] = None
    has_password: bool = False


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


# ====================
# 登录认证相关模型
# ====================

class LoginRequest(BaseModel):
    ehr_no: str
    password: str


class User(BaseModel):
    ehr_no: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    token: Optional[str] = None
    user: Optional[User] = None


class LogoutResponse(BaseModel):
    success: bool
    message: str


class AuthMeResponse(BaseModel):
    ehr_no: str


# ====================
# 操作日志相关模型
# ====================

class AuditLogItem(BaseModel):
    id: int
    ehr_no: Optional[str]
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    detail: Dict[str, Any]
    before_value: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    user_agent: Optional[str]
    status: str
    error_message: Optional[str]
    created_at: datetime


class AuditLogListResponse(BaseModel):
    logs: List[AuditLogItem]
    total: int
    page: int
    page_size: int


class AuditLogQueryParams(BaseModel):
    page: int = 1
    page_size: int = 20
    action: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ====================
# 菜单管理相关模型
# ====================

class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0
    visible_ehrs: Optional[List[str]] = None  # 为 None 表示所有人可见


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    visible_ehrs: Optional[List[str]] = None  # 为 None 表示所有人可见


class CategoryOut(BaseModel):
    id: int
    name: str
    sort_order: int
    visible_ehrs: Optional[List[str]] = None
    items: List["MenuItemOut"] = []
    uncategorized: List["QueryListItem"] = []


class MenuItemCreate(BaseModel):
    category_id: int
    name: str
    sort_order: int = 0


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class MenuItemOut(BaseModel):
    id: int
    name: str
    sort_order: int
    queries: List[QueryListItem] = []


# 更新前向引用
CategoryOut.model_rebuild()
