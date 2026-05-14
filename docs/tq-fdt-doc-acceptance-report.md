# TQ 严格对齐验收报告（TQScore PDF + 界面图）

## 文档来源

- `docs/FDT Score 产品相关 2/fdt-score.pdf`
- `docs/FDT Score 产品相关 2/fdtscore_data_study_1124.pdf`
- `docs/eaglestrikes/.../智能画像/FDTScore产品界面.png`

## 条款对照

| 文档条款 | 系统实现 | 验收方式 |
| --- | --- | --- |
| 核心雷达为四维（盈利、风控、稳定、活跃） | `src/lib/tq/radar-contract.ts` 中 `core` 组固定四轴；`/api/tq/radar` 输出 | 调 `GET /api/tq/radar` 检查 `groups[0].axes` |
| 存在分组雷达（盈利/风控/活跃/稳定） | `radar-contract.ts` 中 4 个分组；`TqScoreCard` 优先渲染后端雷达契约 | 页面查看 `my-learning` 子雷达区块 |
| 需支持分层展示能力 | `profile-rules.ts` 中 `T1/T2/T3` 分层评语逻辑 | 同一分数下分别生成 3 个 tier 证书对比 |
| 需产出报告/证书 | `POST /api/tq/certificates` 生成 PNG+PDF，落表 `tq_certificates` | 触发接口后检查下载链接和数据库记录 |

## 分层证书验收标准

- T1：证书仅展示总分、四维核心雷达、基础评语
- T2：在 T1 基础上增加分组雷达
- T3：在 T2 基础上增加特征解释与进阶建议

## 发布一致性验收

- `GET /api/deploy/version` 返回部署指纹（SHA、来源、时间）
- `GET /api/fdt-score?env=sim&period=all` 不应返回 404
- CI 工作流已接入 `scripts/deploy/verify-release.mjs` 自动校验

