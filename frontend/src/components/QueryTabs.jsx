import React from 'react';
import { Button, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EllipsisOutlined } from '@ant-design/icons';

export default function QueryTabs({ queries, activeId, onSelect, onAddClick, onEdit, onDelete }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* 新增查询按钮单独一行，不带 background */}
      <div style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAddClick}
        >
          新增查询
        </Button>
      </div>

      {/* SQL 查询列表放在独立容器，带筛选区样式 */}
      <div style={{ padding: 12, background: '#fafafa', borderRadius: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {queries.map(q => {
            const isActive = q.id === activeId;
            return (
              <div
                key={q.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0,
                  borderRadius: 4,
                  background: isActive ? '#fa8c16' : '#f0f0f0',
                  border: isActive ? '1px solid #fa8c16' : '1px solid #d9d9d9',
                  overflow: 'hidden',
                  userSelect: 'none',
                  transition: 'all 0.2s',
                }}
              >
                {/* 标签主体：点击切换 */}
                <div
                  onClick={() => onSelect(q.id)}
                  style={{
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: isActive ? '#fff' : 'rgba(0,0,0,0.65)',
                  }}
                >
                  {q.display_name}
                </div>

                {/* 右侧 ... 按钮：点击弹出菜单 */}
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'edit',
                        label: '编辑',
                        icon: <EditOutlined />,
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          onEdit(q.id);
                        },
                      },
                      {
                        key: 'delete',
                        label: '删除',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          onDelete(q.id);
                        },
                      },
                    ],
                  }}
                  trigger={['click']}
                >
                  <div
                    style={{
                      padding: '4px 6px',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.45)',
                      borderLeft: isActive
                        ? `1px solid rgba(255,255,255,0.3)`
                        : `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'}`,
                      transition: 'all 0.2s',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisOutlined />
                  </div>
                </Dropdown>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
