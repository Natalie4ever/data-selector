import React, { useState } from 'react';
import { Dropdown, Empty } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';

export default function MenuSidebar({
  menuTree,
  activeMenuItemId,
  onSelectMenuItem,
  onManageMenu,
  isAdmin,
  loading,
}) {
  const [expandedCategories, setExpandedCategories] = useState({});

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // 右键菜单 - 一级菜单
  const getCategoryMenuItems = (category) => [
    {
      key: 'add-item',
      label: '新增二级菜单',
      icon: <PlusOutlined />,
      onClick: () => onManageMenu('add-item', { categoryId: category.id, categoryName: category.name }),
    },
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => onManageMenu('edit-category', { category }),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onManageMenu('delete-category', { category }),
    },
  ];

  // 右键菜单 - 二级菜单
  const getItemMenuItems = (item, categoryId) => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => onManageMenu('edit-item', { item, categoryId }),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onManageMenu('delete-item', { item }),
    },
  ];

  if (loading) {
    return (
      <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>
        加载中...
      </div>
    );
  }

  if (!menuTree || menuTree.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <Empty
          description="暂无菜单"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
        {isAdmin && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <a onClick={() => onManageMenu('add-category')}>
              <PlusOutlined /> 创建一级菜单
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '8px 0',
      userSelect: 'none',
    }}>
      {/* 未分类入口（所有未分配菜单的查询） */}
      <div
        onClick={() => onSelectMenuItem(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 16px',
          cursor: 'pointer',
          fontSize: 13,
          color: activeMenuItemId === null ? '#1890ff' : '#555',
          fontWeight: activeMenuItemId === null ? 500 : 400,
          background: activeMenuItemId === null ? '#e6f7ff' : 'transparent',
          transition: 'background 0.2s',
          marginBottom: 4,
        }}
        onMouseEnter={(e) => {
          if (activeMenuItemId !== null) {
            e.currentTarget.style.background = '#f5f5f5';
          }
        }}
        onMouseLeave={(e) => {
          if (activeMenuItemId !== null) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <FolderOutlined style={{ marginRight: 8, fontSize: 12, color: '#999' }} />
        <span style={{ flex: 1 }}>未分类</span>
      </div>

      {menuTree.map(category => {
        const isExpanded = expandedCategories[category.id] !== false; // 默认展开

        return (
          <div key={category.id} style={{ marginBottom: 4 }}>
            {/* 一级菜单 */}
            {isAdmin ? (
              <Dropdown
                menu={{ items: getCategoryMenuItems(category) }}
                trigger={['contextMenu']}
              >
                <div
                  onClick={() => toggleCategory(category.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    color: '#333',
                    background: isExpanded ? '#f0f0f0' : 'transparent',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isExpanded ? '#f0f0f0' : 'transparent'}
                >
                  {isExpanded ? (
                    <FolderOpenOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                  ) : (
                    <FolderOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                  )}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {category.name}
                  </span>
                  <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>
                    {category.items.length}
                  </span>
                </div>
              </Dropdown>
            ) : (
              <div
                onClick={() => toggleCategory(category.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#333',
                  background: isExpanded ? '#f0f0f0' : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                onMouseLeave={(e) => e.currentTarget.style.background = isExpanded ? '#f0f0f0' : 'transparent'}
              >
                {isExpanded ? (
                  <FolderOpenOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                ) : (
                  <FolderOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {category.name}
                </span>
                <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>
                  {category.items.length}
                </span>
              </div>
            )}

            {/* 二级菜单列表 */}
            {isExpanded && (
              <div style={{ paddingLeft: 8 }}>
                {category.items.map(item => {
                  const isActive = item.id === activeMenuItemId;

                  return (
                    <div key={item.id}>
                      {/* 二级菜单 */}
                      {isAdmin ? (
                        <Dropdown
                          menu={{ items: getItemMenuItems(item, category.id) }}
                          trigger={['contextMenu']}
                        >
                          <div
                            onClick={() => onSelectMenuItem(item.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 16px 6px 24px',
                              cursor: 'pointer',
                              fontSize: 13,
                              color: isActive ? '#1890ff' : '#555',
                              fontWeight: isActive ? 500 : 400,
                              background: isActive ? '#e6f7ff' : 'transparent',
                              transition: 'background 0.2s',
                              borderRadius: 4,
                              marginRight: 8,
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) {
                                e.currentTarget.style.background = '#f5f5f5';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) {
                                e.currentTarget.style.background = 'transparent';
                              }
                            }}
                          >
                            <FolderOutlined style={{ marginRight: 8, fontSize: 12, color: '#aaa' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </span>
                            <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>
                              {item.queries.length}
                            </span>
                          </div>
                        </Dropdown>
                      ) : (
                        <div
                          onClick={() => onSelectMenuItem(item.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '6px 16px 6px 24px',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: isActive ? '#1890ff' : '#555',
                            fontWeight: isActive ? 500 : 400,
                            background: isActive ? '#e6f7ff' : 'transparent',
                            transition: 'background 0.2s',
                            borderRadius: 4,
                            marginRight: 8,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = '#f5f5f5';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                        >
                          <FolderOutlined style={{ marginRight: 8, fontSize: 12, color: '#aaa' }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>
                            {item.queries.length}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* 管理员新增一级菜单按钮 */}
      {isAdmin && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          marginTop: 8,
        }}>
          <div
            onClick={() => onManageMenu('add-category')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 16px',
              background: '#f7f7f7',
              borderRadius: 4,
              border: '1px dashed #d9d9d9',
              cursor: 'pointer',
              color: '#666',
              fontSize: 13,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e6f7ff';
              e.currentTarget.style.borderColor = '#1890ff';
              e.currentTarget.style.color = '#1890ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f7f7f7';
              e.currentTarget.style.borderColor = '#d9d9d9';
              e.currentTarget.style.color = '#666';
            }}
          >
            <PlusOutlined style={{ fontSize: 12 }} />
            <span>新增一级菜单</span>
          </div>
        </div>
      )}
    </div>
  );
}
