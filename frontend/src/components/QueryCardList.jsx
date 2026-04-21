import React from 'react';
import { Button, Empty, Dropdown, Tag } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';

export default function QueryCardList({
  queries,
  activeQueryId,
  menuItemName,
  onSelectQuery,
  onAddQuery,
  onEditQuery,
  onDeleteQuery,
  onMoveQuery,
  canManage,
  menuTree,
}) {
  // 获取菜单选项（用于移动到）
  const getMenuOptions = () => {
    const options = [{ label: '未分类', value: null }];
    menuTree?.forEach(cat => {
      cat.items.forEach(item => {
        options.push({
          label: `${cat.name} / ${item.name}`,
          value: item.id,
        });
      });
    });
    return options;
  };

  // 生成移动菜单项
  const getMoveMenuItems = (queryId) => {
    const options = getMenuOptions();
    return options.map(opt => ({
      key: opt.value === null ? 'uncategorized' : opt.value,
      label: opt.label,
      onClick: () => onMoveQuery(queryId, opt.value),
    }));
  };

  if (!queries || queries.length === 0) {
    return (
      <div style={{ padding: '20px 0 10px 0' }}>
        <Empty
          description={menuItemName ? `"${menuItemName}" 下暂无查询` : '暂无未分类查询'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddQuery} size="small">
              新增查询
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid #f0f0f0',
      marginBottom: 16,
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>
            {menuItemName || '未分类'}
          </span>
          <Tag>{queries.length} 个查询</Tag>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddQuery} size="small">
            新增
          </Button>
        )}
      </div>

      {/* 查询标签 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        {queries.map(query => {
          const isActive = query.id === activeQueryId;

          // 带操作菜单的标签
          const tagContent = (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0,
              borderRadius: 4,
              background: isActive ? '#1890ff' : '#f0f0f0',
              border: isActive ? '1px solid #1890ff' : '1px solid #d9d9d9',
              overflow: 'hidden',
              userSelect: 'none',
              transition: 'all 0.2s',
            }}>
              {/* 标签主体：点击执行 */}
              <div
                onClick={() => onSelectQuery(query.id)}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: isActive ? '#fff' : 'rgba(0,0,0,0.65)',
                  whiteSpace: 'nowrap',
                }}
              >
                {query.display_name}
              </div>

              {/* 右侧操作按钮 */}
              {canManage && (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'edit',
                        label: '编辑',
                        icon: <EditOutlined />,
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          onEditQuery(query.id);
                        },
                      },
                      {
                        key: 'move',
                        label: '移动到',
                        icon: <SwapOutlined />,
                        children: getMoveMenuItems(query.id),
                      },
                      { type: 'divider' },
                      {
                        key: 'delete',
                        label: '删除',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          onDeleteQuery(query.id);
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
                        ? '1px solid rgba(255,255,255,0.3)'
                        : '1px solid rgba(0,0,0,0.1)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisOutlined />
                  </div>
                </Dropdown>
              )}
            </div>
          );

          return tagContent;
        })}
      </div>
    </div>
  );
}
