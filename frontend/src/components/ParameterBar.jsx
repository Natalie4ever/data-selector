import React from 'react';
import { Form, Input, DatePicker, InputNumber } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

function ParameterBar({ parameters }, ref) {
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

  // 将 form 暴露给父组件通过 ref
  React.useImperativeHandle(ref, () => ({
    getFieldsValue: () => form.getFieldsValue(),
  }));

  if (!parameters || parameters.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ padding: '12px 0 4px 0', borderBottom: '1px solid #f0f0f0' }}>
        <Form form={form} layout="inline">
          {parameters.map((param) => (
            <Form.Item
              key={param.name}
              name={param.name}
              label={param.label}
              style={{ marginBottom: 8 }}
            >
              {renderInput(param)}
            </Form.Item>
          ))}
        </Form>
      </div>
    </div>
  );
}

export default React.forwardRef(ParameterBar);
