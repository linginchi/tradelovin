# DNS 记录示例（阿里云国际站）

目标：将阿里云 `.com` 域名解析到香港轻量服务器，作为内地测试入口。

## 推荐记录

| 记录类型 | 主机记录 | 记录值 | 说明 |
| --- | --- | --- | --- |
| A | @ | `<HK_SERVER_IP>` | 主域名 |
| A | www | `<HK_SERVER_IP>` | www 子域 |

## 建议参数

- TTL: `600`
- 线路类型: 默认
- 生效后验证:
  - `nslookup your-domain.com`
  - `nslookup www.your-domain.com`

## 常见误区

- 不要把测试入口域名 CNAME 到 `tradelovin.com`（会继承被拦截链路）
- 证书申请前必须确认域名已解析到香港服务器公网 IP
