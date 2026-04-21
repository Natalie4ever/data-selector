import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import * as api from './api';

const { Title } = Typography;

export default function LoginPage({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const data = await api.login(values.ehr_no, values.password);
      if (data.success) {
        // 保存 token 到 localStorage
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        message.success('登录成功');
        onLoginSuccess(data);
      } else {
        message.error(data.message || '登录失败');
      }
    } catch (error) {
      message.error(error.message || '登录请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        style={{
          width: 400,
          boxShadow: '0 14px 45px rgba(0, 0, 0, 0.2)',
          borderRadius: 8
        }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 8 }}>数据加工助手</Title>
          <Title level={5} type="secondary" style={{ fontWeight: 'normal' }}>
            请输入 EHR 号和密码登录
          </Title>
        </div>

        <Form
          name="login"
          onFinish={handleSubmit}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            name="ehr_no"
            rules={[
              { required: true, message: '请输入 EHR 号' },
              { pattern: /^\d{7}$/, message: 'EHR 号必须是7位数字' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="EHR 号（7位数字）"
              size="large"
              maxLength={7}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24, color: '#999', fontSize: 12 }}>
          默认账号: EHR 1234567 / Password01!
        </div>
      </Card>
    </div>
  );
}
