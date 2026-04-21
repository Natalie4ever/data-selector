import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message, Alert } from 'antd';

export default function MenuManageModal({
  open,
  onClose,
  mode, // 'add-category', 'edit-category', 'add-item', 'edit-item'
  data, // 传入的数据
  menuTree, // 菜单树，用于选择父级菜单
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onAddItem,
  onEditItem,
  onDeleteItem,
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [visibleType, setVisibleType] = useState('all'); // 'all' | 'specific'

  useEffect(() => {
    if (open) {
      if (mode === 'edit-category' && data?.category) {
        const cat = data.category;
        const visibleEhrs = cat.visible_ehrs ? JSON.parse(cat.visible_ehrs) : [];
        setVisibleType(visibleEhrs && visibleEhrs.length > 0 ? 'specific' : 'all');
        form.setFieldsValue({
          name: cat.name,
          sort_order: cat.sort_order || 0,
          visible_ehrs: visibleEhrs || [],
        });
      } else if (mode === 'add-item' && data?.categoryId) {
        setVisibleType('all');
        form.setFieldsValue({
          category_id: data.categoryId,
          sort_order: 0,
        });
      } else if (mode === 'edit-item' && data?.item) {
        setVisibleType('all');
        form.setFieldsValue({
          name: data.item.name,
          sort_order: data.item.sort_order || 0,
        });
      } else {
        setVisibleType('all');
        form.resetFields();
      }
    }
  }, [open, mode, data, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (mode === 'add-category') {
        await onAddCategory({
          name: values.name,
          sort_order: values.sort_order || 0,
          visible_ehrs: visibleType === 'specific' ? values.visible_ehrs : null,
        });
      } else if (mode === 'edit-category') {
        await onEditCategory(data.category.id, {
          name: values.name,
          sort_order: values.sort_order || 0,
          visible_ehrs: visibleType === 'specific' ? values.visible_ehrs : null,
        });
      } else if (mode === 'add-item') {
        await onAddItem({
          category_id: values.category_id,
          name: values.name,
          sort_order: values.sort_order || 0,
        });
      } else if (mode === 'edit-item') {
        await onEditItem(data.item.id, {
          name: values.name,
          sort_order: values.sort_order || 0,
        });
      }
      message.success('操作成功');
      onClose();
    } catch (error) {
      if (error.errorFields) {
        return; // 表单验证失败
      }
      message.error(error.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      if (mode === 'edit-category') {
        await onDeleteCategory(data.category.id);
      } else if (mode === 'edit-item') {
        await onDeleteItem(data.item.id);
      }
      message.success('删除成功');
      onClose();
    } catch (error) {
      message.error(error.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取一级菜单选项（用于新增二级菜单时选择）
  const categoryOptions = menuTree?.map(cat => ({
    label: cat.name,
    value: cat.id,
  })) || [];

  const getTitle = () => {
    switch (mode) {
      case 'add-category': return '新增一级菜单';
      case 'edit-category': return '编辑一级菜单';
      case 'add-item': return '新增二级菜单';
      case 'edit-item': return '编辑二级菜单';
      default: return '菜单管理';
    }
  };

  const showDeleteButton = mode === 'edit-category' || mode === 'edit-item';

  return (
    <Modal
      title={getTitle()}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="确定"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      width={480}
      footer={showDeleteButton ? [
        <span key="delete-hint" style={{ float: 'left', color: '#999', fontSize: 12 }}>
          删除后，该菜单下的查询将变为"未分类"状态
        </span>,
        <button
          key="delete"
          onClick={handleDelete}
          disabled={loading}
          style={{
            float: 'left',
            marginLeft: 8,
            color: '#ff4d4f',
            background: 'none',
            border: '1px solid #ff4d4f',
            borderRadius: 4,
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          删除
        </button>,
        <button
          key="cancel"
          onClick={onClose}
          style={{
            marginRight: 8,
            padding: '4px 16px',
            borderRadius: 4,
            border: '1px solid #d9d9d9',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          取消
        </button>,
        <button
          key="submit"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '4px 16px',
            borderRadius: 4,
            border: 'none',
            background: '#1890ff',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          确定
        </button>,
      ] : undefined}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* 新增二级菜单时：选择父级菜单 */}
        {mode === 'add-item' && (
          <Form.Item
            name="category_id"
            label="所属一级菜单"
            rules={[{ required: true, message: '请选择所属菜单' }]}
          >
            <Select
              placeholder="请选择一级菜单"
              options={categoryOptions}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        )}

        {/* 菜单名称 */}
        <Form.Item
          name="name"
          label="菜单名称"
          rules={[{ required: true, message: '请输入菜单名称' }]}
        >
          <Input placeholder="请输入菜单名称" maxLength={50} />
        </Form.Item>

        {/* 排序 */}
        <Form.Item
          name="sort_order"
          label="排序序号"
          extra="数字越小越靠前"
        >
          <Input type="number" placeholder="0" min={0} style={{ width: 120 }} />
        </Form.Item>

        {/* 可见范围（仅一级菜单） */}
        {(mode === 'add-category' || mode === 'edit-category') && (
          <>
            <Form.Item label="可见范围">
              <Select
                value={visibleType}
                onChange={setVisibleType}
                style={{ width: 200 }}
                options={[
                  { label: '所有人可见', value: 'all' },
                  { label: '指定用户可见', value: 'specific' },
                ]}
              />
            </Form.Item>

            {visibleType === 'specific' && (
              <Form.Item
                name="visible_ehrs"
                label="允许访问的 EHR 号"
                extra="仅这些用户可以看到此菜单，管理员始终可见"
              >
                <Select
                  mode="tags"
                  placeholder="输入 EHR 号后按回车添加"
                  style={{ width: '100%' }}
                  tokenSeparators={[',']}
                />
              </Form.Item>
            )}

            {visibleType === 'all' && (
              <Alert
                message="所有人可见（包括管理员和普通用户）"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
          </>
        )}
      </Form>
    </Modal>
  );
}
