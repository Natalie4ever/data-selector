import sqlite3
import re
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Any, Dict, Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

from backend import crud
from backend.datasource_manager import load_datasources, build_connection, test_connection
from backend.models import (
    QueryCreate, QueryUpdate, QueryListItem, QueryOut,
    ExecuteRequest, ExecuteResponse, Parameter,
    Datasource, TestConnectionResponse,
    LoginRequest, LoginResponse, LogoutResponse, AuthMeResponse,
    AuditLogListResponse, AuditLogQueryParams,
    CategoryCreate, CategoryUpdate, MenuItemCreate, MenuItemUpdate, CategoryOut
)
from backend.database import init_db
from backend.auth import (
    get_user_by_ehr, verify_password, create_access_token, get_current_user
)
from backend import audit
from fastapi import Request
import uvicorn


app = FastAPI(title="Data Selector API - 多数据源版")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    crud.init_db()


def _get_request_info(request: Request = None) -> tuple:
    """提取请求的 IP 和 User-Agent"""
    if request is None:
        return None, None
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return ip, ua


# ====================
# 查询相关接口（需要登录）
# ====================

@app.get("/api/queries", response_model=List[QueryListItem])
def list_queries(current_user: dict = Depends(get_current_user)):
    return crud.get_all_queries()


@app.post("/api/queries", response_model=int)
def create_query(query: QueryCreate, current_user: dict = Depends(get_current_user), request: Request = None):
    query_id = crud.create_query(query, menu_item_id=query.menu_item_id)
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="QUERY_CREATE",
        target_type="query",
        target_id=str(query_id),
        detail={
            "display_name": query.display_name,
            "datasource_id": query.datasource_id,
            "parameters_count": len(query.parameters),
            "menu_item_id": query.menu_item_id,
        },
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return query_id


@app.get("/api/queries/{query_id}")
def get_query(query_id: int, current_user: dict = Depends(get_current_user)):
    result = crud.get_query_by_id(query_id)
    if not result:
        raise HTTPException(status_code=404, detail="Query not found")
    return result


@app.put("/api/queries/{query_id}")
def update_query(query_id: int, query: QueryUpdate, current_user: dict = Depends(get_current_user), request: Request = None):
    before = crud.get_query_by_id(query_id)
    if not before:
        raise HTTPException(status_code=404, detail="Query not found")
    success = crud.update_query(query_id, query, menu_item_id=query.menu_item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Query not found")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="QUERY_UPDATE",
        target_type="query",
        target_id=str(query_id),
        detail={
            "display_name": query.display_name,
            "datasource_id": query.datasource_id,
            "parameters_count": len(query.parameters) if query.parameters is not None else None,
            "menu_item_id": query.menu_item_id,
        },
        before_value=before,
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


@app.delete("/api/queries/{query_id}")
def delete_query(query_id: int, current_user: dict = Depends(get_current_user), request: Request = None):
    before = crud.get_query_by_id(query_id)
    success = crud.delete_query(query_id)
    if not success:
        raise HTTPException(status_code=404, detail="Query not found")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="QUERY_DELETE",
        target_type="query",
        target_id=str(query_id),
        detail={"deleted_display_name": before["display_name"] if before else None},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


@app.post("/api/queries/{query_id}/execute", response_model=ExecuteResponse)
def execute_query(query_id: int, req: ExecuteRequest, current_user: dict = Depends(get_current_user), request: Request = None):
    query_data = crud.get_query_by_id(query_id)
    if not query_data:
        raise HTTPException(status_code=404, detail="Query not found")

    sql_text = query_data["sql_text"]
    params = req.params

    # 替换命名参数
    if params:
        for name, value in params.items():
            placeholder = f":{name}"
            if placeholder in sql_text:
                sql_text = sql_text.replace(
                    placeholder,
                    f"'{value}'" if isinstance(value, str) else str(value)
                )

    # 注入时间筛选条件
    time_filters = req.time_filters
    if time_filters:
        time_conditions = []
        for col, tf in time_filters.items():
            if not isinstance(tf, dict):
                continue
            col_escaped = col.replace("'", "''")
            start = tf.get("start")
            end = tf.get("end")
            if start and end:
                time_conditions.append(f"{col_escaped} >= '{start}' AND {col_escaped} <= '{end}'")
            elif start:
                time_conditions.append(f"{col_escaped} >= '{start}'")
            elif end:
                time_conditions.append(f"{col_escaped} <= '{end}'")
        if time_conditions:
            where_clause = " AND ".join(time_conditions)
            sql_upper = sql_text.strip().upper()
            if " WHERE " in sql_upper:
                # 已有 WHERE 子句，追加条件
                # 找到最后一个 WHERE 的位置（大小写不敏感）
                idx = sql_upper.rfind(" WHERE ")
                insert_pos = idx + 7  # len(" WHERE ")
                # 在 WHERE 后插入括号条件
                before = sql_text[:insert_pos]
                after = sql_text[insert_pos:]
                sql_text = f"{before} ({where_clause}) AND {after}"
            else:
                # 没有 WHERE 子句，在 ORDER BY/GROUP BY/LIMIT 前或末尾插入
                # 检查是否有 ORDER BY / GROUP BY / LIMIT
                for keyword in [" ORDER BY ", " GROUP BY ", " LIMIT "]:
                    idx_upper = sql_upper.find(keyword)
                    if idx_upper != -1:
                        sql_text = f"{sql_text[:idx_upper]} WHERE {where_clause} {sql_text[idx_upper:]}"
                        break
                else:
                    sql_text = f"{sql_text.rstrip(';')} WHERE {where_clause}"

    # 根据数据源创建连接
    datasource_id = query_data.get("datasource_id")
    print(f"[DEBUG] execute_query: query_id={query_id}, datasource_id={datasource_id!r}")
    print(f"[DEBUG] query_data keys: {list(query_data.keys())}")

    try:
        conn = build_connection(datasource_id)
    except Exception as e:
        ip, ua = _get_request_info(request)
        audit.log_operation(
            action="QUERY_EXECUTE",
            target_type="query",
            target_id=str(query_id),
            detail={"params": params},
            status="failed",
            error_message=f"数据库连接失败: {str(e)}",
            ehr_no=current_user.get("ehr_no"),
            ip_address=ip,
            user_agent=ua,
        )
        raise HTTPException(status_code=500, detail=f"数据库连接失败: {str(e)}")

    try:
        # 统一处理 row_factory
        if hasattr(conn, 'row_factory'):
            conn.row_factory = sqlite3.Row

        cursor = conn.execute(sql_text)
        rows = cursor.fetchall()

        if not rows:
            conn.close()
            ip, ua = _get_request_info(request)
            audit.log_operation(
                action="QUERY_EXECUTE",
                target_type="query",
                target_id=str(query_id),
                detail={"params": params, "row_count": 0},
                ehr_no=current_user.get("ehr_no"),
                ip_address=ip,
                user_agent=ua,
            )
            return ExecuteResponse(columns=[], rows=[], types={})

        # 获取列信息
        columns = [desc[0] for desc in cursor.description]
        # 不同数据库返回的类型信息格式不同，统一转为 int
        types = {desc[0]: desc[1] for desc in cursor.description}

        # 转换为字典列表
        # 不同驱动返回格式不同，做兼容处理
        data_rows = []
        for row in rows:
            if isinstance(row, dict):
                data_rows.append(dict(row))
            elif hasattr(row, '_asdict'):
                # SQLAlchemy/psycopg2 结果
                data_rows.append(dict(row._asdict()))
            else:
                # sqlite3.Row
                data_rows.append(dict(row))

    except Exception as e:
        conn.close()
        ip, ua = _get_request_info(request)
        audit.log_operation(
            action="QUERY_EXECUTE",
            target_type="query",
            target_id=str(query_id),
            detail={"params": params},
            status="failed",
            error_message=f"查询执行失败: {str(e)}",
            ehr_no=current_user.get("ehr_no"),
            ip_address=ip,
            user_agent=ua,
        )
        raise HTTPException(status_code=400, detail=f"查询执行失败: {str(e)}")

    conn.close()

    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="QUERY_EXECUTE",
        target_type="query",
        target_id=str(query_id),
        detail={"params": params, "row_count": len(data_rows)},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )

    return ExecuteResponse(columns=columns, rows=data_rows, types=types)


# ====================
# 数据源相关接口（需要登录）
# ====================

@app.get("/api/datasources", response_model=List[Datasource])
def list_datasources(current_user: dict = Depends(get_current_user)):
    """获取所有可用的数据源列表（不含密码）"""
    return load_datasources()


@app.post("/api/datasources/{ds_id}/test", response_model=TestConnectionResponse)
def test_datasource_connection(ds_id: str, current_user: dict = Depends(get_current_user), request: Request = None):
    """测试指定数据源的连接"""
    success, message = test_connection(ds_id)
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="DATASOURCE_TEST",
        target_type="datasource",
        target_id=ds_id,
        detail={"datasource_id": ds_id},
        status="success" if success else "failed",
        error_message=None if success else message,
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return TestConnectionResponse(success=success, message=message)


# ====================
# 认证相关接口
# ====================

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request = None):
    """
    用户登录
    - 根据 EHR 号查询用户
    - 验证密码
    - 返回 JWT Token
    """
    ip, ua = _get_request_info(request)
    user = get_user_by_ehr(req.ehr_no)
    if not user:
        audit.log_operation(
            action="LOGIN",
            target_type="auth",
            detail={"ehr_no": req.ehr_no},
            status="failed",
            error_message="用户不存在",
            ip_address=ip,
            user_agent=ua,
        )
        return LoginResponse(success=False, message="EHR号或密码错误")

    # 前端已对密码进行哈希，使用前端哈希方案验证
    if not verify_password(req.password, user["password_hash"], req.ehr_no):
        audit.log_operation(
            action="LOGIN",
            target_type="auth",
            detail={"ehr_no": req.ehr_no},
            status="failed",
            error_message="密码错误",
            ip_address=ip,
            user_agent=ua,
        )
        return LoginResponse(success=False, message="EHR号或密码错误")

    token = create_access_token({"sub": user["ehr_no"]})
    audit.log_operation(
        action="LOGIN",
        target_type="auth",
        detail={"ehr_no": req.ehr_no},
        status="success",
        ip_address=ip,
        user_agent=ua,
    )
    return LoginResponse(
        success=True,
        message="登录成功",
        token=token,
        user={"ehr_no": user["ehr_no"]}
    )


@app.post("/api/auth/logout", response_model=LogoutResponse)
async def logout(current_user: dict = Depends(get_current_user), request: Request = None):
    """
    用户登出
    前端删除 Token 即可，后端简单返回成功
    """
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="LOGOUT",
        target_type="auth",
        detail={"ehr_no": current_user.get("ehr_no")},
        status="success",
        ip_address=ip,
        user_agent=ua,
    )
    return LogoutResponse(success=True, message="登出成功")


@app.get("/api/auth/me", response_model=AuthMeResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return AuthMeResponse(ehr_no=current_user["ehr_no"])


# ====================
# 审计日志接口
# ====================

@app.get("/api/audit/logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    page: int = 1,
    page_size: int = 20,
    action: str = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """分页查询审计日志（仅白名单用户可访问）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权查看审计日志")

    result = audit.get_audit_logs(
        page=page,
        page_size=page_size,
        action=action,
        start_date=start_date,
        end_date=end_date,
    )
    return AuditLogListResponse(**result)


@app.get("/api/audit/can-view")
async def check_can_view_audit_logs(current_user: dict = Depends(get_current_user)):
    """检查当前用户是否有权限查看审计日志"""
    return {"can_view": audit.can_view_audit_logs(current_user.get("ehr_no"))}


@app.get("/api/auth/is-admin")
async def check_is_admin(current_user: dict = Depends(get_current_user)):
    """检查当前用户是否为管理员（白名单用户）"""
    return {"is_admin": audit.can_view_audit_logs(current_user.get("ehr_no"))}


# ====================
# 菜单管理接口（仅白名单用户可访问）
# ====================

@app.get("/api/menus/tree")
async def get_menu_tree(current_user: dict = Depends(get_current_user)):
    """获取菜单树，包含一级菜单、二级菜单和查询"""
    ehr_no = current_user.get("ehr_no")
    is_admin = audit.can_view_audit_logs(ehr_no)
    return crud.get_menu_tree(ehr_no=ehr_no, is_admin=is_admin)


@app.post("/api/menus/categories")
async def create_category(
    category: CategoryCreate,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """新增一级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    category_id = crud.create_category(
        name=category.name,
        sort_order=category.sort_order,
        visible_ehrs=category.visible_ehrs
    )
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="CATEGORY_CREATE",
        target_type="category",
        target_id=str(category_id),
        detail={"name": category.name, "visible_ehrs": category.visible_ehrs},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"id": category_id}


@app.put("/api/menus/categories/{category_id}")
async def update_category(
    category_id: int,
    category: CategoryUpdate,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """更新一级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    success = crud.update_category(
        category_id=category_id,
        name=category.name,
        sort_order=category.sort_order,
        visible_ehrs=category.visible_ehrs
    )
    if not success:
        raise HTTPException(status_code=404, detail="菜单不存在")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="CATEGORY_UPDATE",
        target_type="category",
        target_id=str(category_id),
        detail={"name": category.name, "visible_ehrs": category.visible_ehrs},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


@app.delete("/api/menus/categories/{category_id}")
async def delete_category(
    category_id: int,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """删除一级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    success = crud.delete_category(category_id)
    if not success:
        raise HTTPException(status_code=404, detail="菜单不存在")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="CATEGORY_DELETE",
        target_type="category",
        target_id=str(category_id),
        detail={},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


@app.post("/api/menus/items")
async def create_menu_item(
    item: MenuItemCreate,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """新增二级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    item_id = crud.create_menu_item(
        category_id=item.category_id,
        name=item.name,
        sort_order=item.sort_order
    )
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="MENU_ITEM_CREATE",
        target_type="menu_item",
        target_id=str(item_id),
        detail={"category_id": item.category_id, "name": item.name},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"id": item_id}


@app.put("/api/menus/items/{item_id}")
async def update_menu_item(
    item_id: int,
    item: MenuItemUpdate,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """更新二级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    success = crud.update_menu_item(
        item_id=item_id,
        name=item.name,
        sort_order=item.sort_order
    )
    if not success:
        raise HTTPException(status_code=404, detail="菜单不存在")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="MENU_ITEM_UPDATE",
        target_type="menu_item",
        target_id=str(item_id),
        detail={"name": item.name},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


@app.delete("/api/menus/items/{item_id}")
async def delete_menu_item(
    item_id: int,
    current_user: dict = Depends(get_current_user),
    request: Request = None
):
    """删除二级菜单（仅白名单用户）"""
    if not audit.can_view_audit_logs(current_user.get("ehr_no")):
        raise HTTPException(status_code=403, detail="无权管理菜单")
    success = crud.delete_menu_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="菜单不存在")
    ip, ua = _get_request_info(request)
    audit.log_operation(
        action="MENU_ITEM_DELETE",
        target_type="menu_item",
        target_id=str(item_id),
        detail={},
        ehr_no=current_user.get("ehr_no"),
        ip_address=ip,
        user_agent=ua,
    )
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
