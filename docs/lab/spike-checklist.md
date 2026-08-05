# AI 研究实验室 · Spike Gate Checklist

**目标：** 验证 DojoAgents + Gemini 是否足以支撑 P0「组合诊断」；任一硬条件失败则启用自研 fallback。

**日期：** ________  
**执行人：** ________  
**DojoAgents 版本锁定：** ________（PyPI / git SHA）

---

## Gate A — 自托管

- [ ] `uv pip install dojoagents==…` 在目标 VPS 成功
- [ ] `dojoagents dashboard`（或等价服务）可访问
- [ ] 锁定版本号已写入 [dojo-vps-runbook.md](./dojo-vps-runbook.md)

**结果：** Pass / Fail  
**备注：**

---

## Gate B — Gemini 多模态

- [ ] 配置 `GEMINI_API_KEY`（或 Dojo UI 等价配置）
- [ ] 选定 model id：`________________`（建议优先支持 vision 的 Gemini 型号）
- [ ] 用 ≥3 张匿名/虚构持仓截图测试识别
- [ ] 记录单次大约 token / 费用：________
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

## Gate E — 模型健康检查（后台切换预留）

- [ ] `/health/models`（或等价）返回 `gemini.configured` + `visionCapable`
- [ ] GLM 未配置时 `configured=false`，主站后台不可选
- [ ] （可选）配置 GLM 后验证 visionCapable

**结果：** Pass / Fail  

---

## 决策

| 选项 | 勾选 |
|------|------|
| 全部 Gate Pass → 继续 P0-A（Dojo 路径） | [ ] |
| 任一硬 Gate Fail → 自研 lab-worker + Gemini（保留主站接口） | [ ] |

**决策人：** ________ **日期：** ________
