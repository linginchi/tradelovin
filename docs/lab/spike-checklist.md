# AI量化实验室 · Spike Gate Checklist

**目标：** 验证 DojoAgents + 火山（volcano）是否足以支撑 P0「组合诊断」；任一硬条件失败则启用自研 fallback（lab-worker + volcano SDK）。

**日期：** ________  
**执行人：** ________  
**DojoAgents 版本锁定：** ________（PyPI / git SHA）  
**火山 API 路径（TBD）：** Path A 方舟 `ARK_API_KEY` / Path B 视觉智能 `VOLC_ACCESS_KEY` + `VOLC_SECRET_KEY`（二选一，Spike 锁定）

---

## Gate A — 自托管

- [ ] `uv pip install dojoagents==…` 在目标 VPS 成功
- [ ] `dojoagents dashboard`（或等价服务）可访问
- [ ] 锁定版本号已写入 [dojo-vps-runbook.md](./dojo-vps-runbook.md)

**结果：** Pass / Fail  
**备注：**

---

## Gate B — 火山多模态

- [ ] 配置 Path A（`ARK_API_KEY`）或 Path B（`VOLC_ACCESS_KEY` + `VOLC_SECRET_KEY`）（仅 VPS；勿写入 lab_config / git）
- [ ] 选定 volcano model id：`________________`（Spike 锁定前占位 `pending-spike`；勿臆造 Doubao/Ark id）
- [ ] 用 ≥3 张匿名/虚构持仓截图测试识别
- [ ] 记录单次大约 token / 费用（按火山引擎定价估算）：________
- [ ] 确认图片数据政策可接受，UI 需同意文案：是 / 否

**结果：** Pass / Fail  
**备注：**

---

## Gate C — 去标的化 JSON

要求输出符合主站 schema（行业暴露 / 集中度 / 风险主题 / 教学问题 / disclaimer），**用户报告不含**股票代码、名称、买卖指令。

- [ ] 可经 prompt + 后处理得到合规 JSON
- [ ] 故意诱导荐股时，输出仍可被主站过滤器拦截或改写
- [ ] 样例 JSON 粘贴到下方

```json
{}
```

**结果：** Pass / Fail  

---

## Gate D — SSO + 回调

- [ ] 主站签发 auth code → Dojo callback → exchange 成功
- [ ] Session cookie HttpOnly
- [ ] 诊断完成后 `POST /api/lab/session` 可写通（或 mock）
- [ ] URL 中无长期 JWT

**结果：** Pass / Fail  

---

## Gate E — 模型健康检查（volcano only）

- [ ] `/health/models` 恰好一个 `id: "volcano"`（未知 id 忽略；重复 volcano 形状失败）
- [ ] volcano `configured=true` **且** `visionCapable=true`
- [ ] `models` 为 Spike 锁定的 id 列表（锁定前可为 `pending-spike`）；后台仅能从该列表选 volcano model id

**结果：** Pass / Fail  

---

## 决策

| 选项 | 勾选 |
|------|------|
| 全部 Gate Pass → 继续 P0-A（Dojo 路径） | [ ] |
| 任一硬 Gate Fail → 自研 lab-worker + volcano SDK（保留主站接口） | [ ] |

**决策人：** ________ **日期：** ________
