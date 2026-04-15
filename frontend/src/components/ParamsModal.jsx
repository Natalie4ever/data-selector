import React from 'react';
import { Modal, Form, Input, DatePicker, InputNumber } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ParamsModal({ open, parameters, queryName, onConfirm, onCancel }) {
  const [form] = Form.useForm();

  const renderInput = (param) => {
    switch (param.type) {
      case 'date':
        return <Input type="date" />;
      case 'number':
        return <InputNumber style={{ width: '100%' }} />;
      default:
        return <Input />;
    }
  };

  const handleOk = () => {
    const values = form.getFieldsValue();
    const params = {};
    for (const [key, value] of Object.entries(values)) {
      if (dayjs.isDayjs(value)) {
        params[key] = value.format('YYYY-MM-DD');
      } else {
        params[key] = value;
      }
    }
    onConfirm(params);
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={`输入参数 - ${queryName}`}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="确认"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {parameters.map((param) => (
          <Form.Item
            key={param.name}
            name={param.name}
            label={param.label}
            rules={[{ required: true, message: `请输入 ${param.label}` }]}
          >
            {renderInput(param)}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
