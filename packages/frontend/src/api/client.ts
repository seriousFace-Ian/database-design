import axios from 'axios';
import { message } from 'antd';

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const msg =
      error.response?.data?.error?.message ??
      error.message ??
      '请求失败，请检查后端服务是否启动';
    message.error(msg);
    return Promise.reject(error);
  }
);

export default client;
