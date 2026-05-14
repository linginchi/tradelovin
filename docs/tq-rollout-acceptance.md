# TradeQuotient 上线验收与灰度流程

## 1. 上线前验收清单

- 数据模型
  - `sim_trades` 已包含 `environment/source/user_id/external_trade_id`
  - `tq_features/tq_scores/tq_baseline_users/tq_config/tq_cron_runs` 表存在且可读写
- 评分准确性
  - 同一用户在 `sim/live` + `all/monthly/weekly/daily` 可重复算出相同结果
  - `tq_features` 中 `raw_value`、`norm_score` 与 `tq_scores` 维度/总分可回溯
- API 契约
  - `/api/tq/score`、`/api/tq/features` 正常
  - `/api/fdt-score` 兼容可用并返回 `Deprecation`/`Sunset` 标记
- 调度与运维
  - `/api/tq/cron/recalculate` 支持 `env`、`period` 参数
  - `tq_cron_runs` 能看到成功/失败/跳过状态

## 2. 灰度策略

1. **阶段 A（仅模拟）**
   - cron 只跑 `env=sim&period=all`
   - 前端默认展示模拟分，保留实盘切换但可为空
2. **阶段 B（实盘导入）**
   - 开放 `/api/tq/import-live` 给白名单系统
   - cron 增加 `env=live&period=all`
3. **阶段 C（多周期）**
   - 对内开放 `monthly/weekly/daily`
   - 观察 7 天后再面向全部用户开启
4. **阶段 D（旧接口下线）**
   - 监控 `/api/fdt-score` 调用量归零
   - 到 Sunset 日期后下线兼容别名

## 3. 冷启动规则

- `sim`：交易笔数 `< 10` 时 `totalScore = 0`
- `live`：交易笔数 `< 20` 时 `totalScore = 0`
- 前端显示“交易数据不足，暂未生成有效评分”

## 4. 权限与安全

- 用户读取：`/api/tq/score`、`/api/tq/features` 仅本人；管理员可代查
- 管理员接口：`/api/tq/recalculate`、`/api/admin/tq-config` 要求 `super_admin`
- 实盘导入：`/api/tq/import-live` 强制 API Key，建议同时启用 HMAC
- cron 接口：`/api/tq/cron/recalculate` 强制 `x-tq-cron-key`

