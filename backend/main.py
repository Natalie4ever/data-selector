import sqlite3
import re
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Any, Dict, Optional
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

from backend import crud
from backend.datasource_manager import load_datasources, build_connection, test_connection
from backend.models import (
    QueryCreate, QueryUpdate, QueryListItem, QueryOut,
    ExecuteRequest, ExecuteResponse, Parameter,
    Datasource, TestConnectionResponse
)
from backend.database import init_db
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


# ====================
# 查询相关接口
# ====================

@app.get("/api/queries", response_model=List[QueryListItem])
def list_queries():
    return crud.get_all_queries()


@app.post("/api/queries", response_model=int)
def create_query(query: QueryCreate):
    return crud.create_query(query)


@app.get("/api/queries/{query_id}")
def get_query(query_id: int):
    result = crud.get_query_by_id(query_id)
    if not result:
        raise HTTPException(status_code=404, detail="Query not found")
    return result


@app.put("/api/queries/{query_id}")
def update_query(query_id: int, query: QueryUpdate):
    success = crud.update_query(query_id, query)
    if not success:
        raise HTTPException(status_code=404, detail="Query not found")
    return {"status": "ok"}


@app.delete("/api/queries/{query_id}")
def delete_query(query_id: int):
    success = crud.delete_query(query_id)
    if not success:
        raise HTTPException(status_code=404, detail="Query not found")
    return {"status": "ok"}


@app.post("/api/queries/{query_id}/execute", response_model=ExecuteResponse)
def execute_query(query_id: int, req: ExecuteRequest):
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

    # 根据数据源创建连接
    datasource_id = query_data.get("datasource_id")
    print(f"[DEBUG] execute_query: query_id={query_id}, datasource_id={datasource_id!r}")
    print(f"[DEBUG] query_data keys: {list(query_data.keys())}")

    try:
        conn = build_connection(datasource_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"数据库连接失败: {str(e)}")

    try:
        # 统一处理 row_factory
        if hasattr(conn, 'row_factory'):
            conn.row_factory = sqlite3.Row

        cursor = conn.execute(sql_text)
        rows = cursor.fetchall()

        if not rows:
            conn.close()
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
        raise HTTPException(status_code=400, detail=f"查询执行失败: {str(e)}")

    conn.close()

    # 如果有日期分组需求，在后端处理
    if req.date_column and req.group_by and req.date_column in columns:
        data_rows = _group_by_date(
            data_rows, req.date_column, req.group_by,
            columns, types, req.column_config
        )

    return ExecuteResponse(columns=columns, rows=data_rows, types=types)


# ====================
# 数据源相关接口
# ====================

@app.get("/api/datasources", response_model=List[Datasource])
def list_datasources():
    """获取所有可用的数据源列表（不含密码）"""
    return load_datasources()


@app.post("/api/datasources/{ds_id}/test", response_model=TestConnectionResponse)
def test_datasource_connection(ds_id: str):
    """测试指定数据源的连接"""
    success, message = test_connection(ds_id)
    return TestConnectionResponse(success=success, message=message)


# ====================
# 日期分组逻辑
# ====================

def _group_by_date(
    rows: List[Dict[str, Any]],
    date_column: str,
    group_by: str,
    columns: List[str],
    types: Dict[str, Optional[int]],
    column_config: List[Any] = None
) -> List[Dict[str, Any]]:
    """后端按照日/周/月分组汇总数据"""
    from collections import defaultdict
    import re

    # 构建列名 -> 配置的映射
    config_map = {}
    if column_config:
        for c in column_config:
            if hasattr(c, 'model_dump'):
                c_dict = c.model_dump()
            else:
                c_dict = c
            config_map[c_dict.get("name", "")] = c_dict

    # 用于记录每个聚合组中，每个数值列的原始值列表（用于 expression 列）
    agg_values = defaultdict(lambda: defaultdict(list))

    date_keys = {}

    for row in rows:
        date_str = row.get(date_column)
        if not date_str:
            continue

        # 解析日期
        try:
            if isinstance(date_str, str):
                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"]:
                    try:
                        dt = datetime.strptime(date_str, fmt)
                        break
                    except ValueError:
                        dt = None
                if dt is None:
                    continue
            else:
                dt = datetime.strptime(str(date_str), "%Y-%m-%d")

            if group_by == "day":
                key = dt.strftime("%Y-%m-%d")
            elif group_by == "week":
                key = f"{dt.year}-W{dt.isocalendar()[1]:02d}"
            elif group_by == "month":
                key = dt.strftime("%Y-%m")
            else:
                key = dt.strftime("%Y-%m-%d")

            date_keys[key] = key

            # 收集每个列的值（用于 expression 计算）
            for col, val in row.items():
                if col == date_column:
                    continue
                agg_values[key][col].append(val)
        except Exception:
            continue

    # 执行聚合
    result = []
    for key in sorted(date_keys.keys()):
        row_dict = {"_date_key": key}
        for col in columns:
            if col == date_column:
                row_dict[col] = key
                continue
            config = config_map.get(col)
            vals = agg_values[key].get(col, [])

            if not vals:
                row_dict[col] = None
                continue

            # 根据配置的聚合类型处理
            if config and config.get("agg_type") == "expression":
                # 计算列：从其他列的聚合值代入表达式计算
                expr = config.get("agg_expr", "")
                col_vals = agg_values[key]
                try:
                    # 替换表达式中的列名为对应的聚合值
                    eval_expr = expr
                    for src_col in re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', expr):
                        if src_col in col_vals and col_vals[src_col]:
                            # 简单处理：使用 SUM
                            numeric_vals = [v for v in col_vals[src_col] if isinstance(v, (int, float))]
                            if numeric_vals:
                                col_sum = sum(numeric_vals)
                                eval_expr = re.sub(r'\b' + src_col + r'\b', str(col_sum), eval_expr)
                    row_dict[col] = eval(eval_expr)
                    # 避免除以零
                    if isinstance(row_dict[col], float) and (row_dict[col] == float('inf') or (row_dict[col] != row_dict[col])):
                        row_dict[col] = None
                except Exception:
                    row_dict[col] = None
            elif config and config.get("agg_type") == "不聚合":
                row_dict[col] = vals[0] if vals else None
            elif config and config.get("agg_type") == "MAX":
                row_dict[col] = max([v for v in vals if isinstance(v, (int, float))]) if any(isinstance(v, (int, float)) for v in vals) else None
            elif config and config.get("agg_type") == "MIN":
                row_dict[col] = min([v for v in vals if isinstance(v, (int, float))]) if any(isinstance(v, (int, float)) for v in vals) else None
            elif config and config.get("agg_type") == "AVG":
                numeric_vals = [v for v in vals if isinstance(v, (int, float))]
                row_dict[col] = sum(numeric_vals) / len(numeric_vals) if numeric_vals else None
            elif config and config.get("agg_type") == "COUNT":
                row_dict[col] = len([v for v in vals if v is not None and v != ""])
            else:
                # 默认 SUM
                numeric_vals = [v for v in vals if isinstance(v, (int, float))]
                row_dict[col] = sum(numeric_vals) if numeric_vals else None

        del row_dict["_date_key"]
        result.append(row_dict)

    return result


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
