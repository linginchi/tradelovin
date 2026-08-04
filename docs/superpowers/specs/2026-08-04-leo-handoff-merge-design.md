# LEO Handoff 合并设计（不覆盖现网）

**日期：** 2026-08-04  
**状态：** 已实现（`feat/leo-handoff-merge`）  
**工作区：** `/Users/linginchi/Projects/tradelovin-dev`  
**生产基线：** `origin/main`（三卡 #21、豹哥播放 #22、鉴权修复）

## 目标

将 Claude Lab/Windows 期 LEO 上线前项落地到生产代码树，且不覆盖已上线能力。

## 数据语义：`published_at`

| 值 | 含义 |
|---|---|
| `NULL` | draft，不对游客公开 |
| `<= now()` | 已上架 |
| `> now()` | 排程，到期自动可见 |

迁移：`supabase/migrations/20260804120000_course_videos_published_at.sql`  
一次性 backfill 现有片为 live；管线新片 INSERT `published_at=null`。

## 分批范围

1. **LEO-004**：`scripts/test/leo-004/*` 管线脚本（draft-only）
2. **LEO-008**：审片发布台 + 公开 list/play 过滤
3. **LEO-005**：首页 `home_hero_v1`，保留四入口
4. **LEO-007**：三语品牌「新紮學豹 / Leo Learns To Trade」

## 禁止覆盖

- 鉴权 cookie / anon JWT
- 视频三卡 hub
- 豹哥 Supabase `Videos` 签名播放
- 游客 10s 试看
- 首页四入口（含 Lab）
- FPS 户名 `TradeLovin Limited`（须 CEO 核银行记录后再改）
- 不移植配额制 / `content_kind` 整包 / 旧 KOL AI pipeline / Lab AI Quant 归档

## 关键路径

- Admin UI：`/cjkzt/video-publish`
- Admin list：`GET /api/admin/videos?status=`
- Admin preview：`GET /api/admin/courses/:courseId/videos/:videoId/play`
- Publish PATCH：`PATCH /api/admin/courses/:courseId/videos/:videoId` `{ published_at }`
- Public list/play：过滤未到点；管理员会话可预览 draft
