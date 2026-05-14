# TQ Live Import API

本文档定义 `POST /api/tq/import-live` 的接入规范，用于第三方实盘系统批量推送成交记录。

## 鉴权

- Header `x-tq-api-key`（或 `x-api-key` / `Authorization: Bearer ...`）
- 值必须与服务端环境变量 `TQ_IMPORT_LIVE_API_KEY` 一致

## 可选签名（推荐）

当服务端配置 `TQ_IMPORT_LIVE_SIGNING_SECRET` 时，必须同时传入：

- `x-tq-timestamp`: 毫秒时间戳
- `x-tq-signature`: `hex(hmac_sha256(secret, timestamp + "." + rawBody))`

签名窗口为 5 分钟，超时视为无效请求。

## 幂等

- 必须传 `x-idempotency-key`
- 服务端将请求写入 `tq_live_import_requests`
- 若重复提交同一个 `x-idempotency-key`，接口返回 `duplicated: true`

## 请求体

```json
{
  "trades": [
    {
      "userId": "00000000-0000-0000-0000-000000000001",
      "symbol": "00700.HK",
      "side": "buy",
      "price": 322.5,
      "quantity": 100,
      "commission": 12.3,
      "stampTax": 4.1,
      "tradeTime": "2026-04-30T09:35:00+08:00",
      "source": "live_api",
      "externalTradeId": "broker-20260430-abc-001"
    }
  ]
}
```

## 响应

成功：

```json
{
  "success": true,
  "imported": 1,
  "requestId": "your-idempotency-key"
}
```

重复幂等键：

```json
{
  "success": true,
  "imported": 0,
  "duplicated": true,
  "requestId": "your-idempotency-key"
}
```

## 数据落库规则

- 数据写入 `sim_trades`
- 固定 `environment = "live"`
- `source` 默认 `live_api`
- 通过唯一索引 `(source, external_trade_id)` 去重（当 `external_trade_id` 非空）

## 推荐调用顺序

1. 发送批量成交到 `/api/tq/import-live`
2. 由定时任务统一重算，或管理员调用 `/api/tq/recalculate`（`environment=live`）
3. 前端使用 `/api/tq/score?env=live&period=all` 展示实盘 TQ

