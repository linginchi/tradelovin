# 视频观看人次与合作伙伴二维码 + 15 秒试看积分验证

> 日期: 2026-06-17
> 状态: 设计已批准

## 概述

为课程视频系统增加三个功能：
1. 视频观看人次统计与显示
2. 合作伙伴二维码上传与展示
3. 游客 15 秒免费试看 + 登录后积分验证播放

## 功能详述

### A. 视频观看人次统计

**需求**: 每个视频显示累计观看人次（一人看 10 次 = 10 人次）。

**数据库变更**:
- `course_videos` 新增列 `view_count INTEGER NOT NULL DEFAULT 0`
- 新建 `video_view_log` 表: `(id UUID PK, video_id UUID FK, user_id UUID FK, created_at TIMESTAMPTZ)`, 唯一约束 `(video_id, user_id)`

**计数机制**:
- 在 `POST /api/courses/video/progress` 中, 当用户进度首次达到 `position >= 5` 时触发计数
- 插入一条 `video_view_log` (ON CONFLICT DO NOTHING), 然后 `UPDATE course_videos SET view_count = view_count + 1`
- 每个用户对每个视频只计 1 次

**回填**: 迁移 SQL 从 `user_video_progress` (position > 0 OR completed = true) 统计写入 `view_count`

**显示位置**:
- 视频播放器下方 (`VideoPlayerClient.tsx`): "XX 人次观看"
- 课程详情视频列表 (`CourseDetailClient.tsx`): 每条视频旁边显示人次

### B. 合作伙伴二维码

**需求**: 每个课程视频下方显示合作方二维码 (固定图片, 全课统一, 目前为广发证券引流码)。

**数据库变更**:
- `courses` 新增 `partner_qr_url TEXT` (可空)
- `courses` 新增 `partner_qr_label TEXT NOT NULL DEFAULT '合作夥伴'`

**管理端**: `AdminCourseDetailClient.tsx` 新增 QR 码上传区域, 复用 `src/lib/video/storage.ts` 上传 R2 (key: `partner-qr/{courseId}-{timestamp}.png`)

**前端显示**: `VideoPlayerClient.tsx` 当 `partner_qr_url` 不为空时, 在视频下方显示二维码图片 + "合作夥伴" 标签

### C. 15 秒试看 + 积分验证

**需求**: 游客可免费试看 15 秒, 然后需登录; 已登录但未报名课程的用户消耗积分观看; 已报名用户不变。

**播放权限链路**:

```
视频播放请求
├─ 未登录 → 返回 trial=true, trialDuration=15 → 前端 15s 暂停, 提示登录
├─ 已登录
│   ├─ 有课程权限 (approved/paid) → 完整播放 (现有逻辑不变)
│   └─ 无课程权限
│       ├─ 积分 >= VIDEO_POINTS_COST → 扣积分 → 完整播放
│       └─ 积分不足 → 返回 requiresPoints/balance, 提示购买积分
```

**API 改动** (`GET /api/courses/[courseId]/videos/[videoId]/play`):
- 返回新增字段: `trial?: boolean`, `trialDuration?: number`, `requiresPoints?: number`, `balance?: number`
- 积分扣除逻辑: 调用 `consumePointsForVideo()` (新增函数)
- 积分常量: `VIDEO_POINTS_COST = 10` (写在 `src/lib/points/service.ts`)

**前端改动** (`VideoPlayerClient.tsx`):
- `trial` 模式: 监听 `timeupdate`, 到达 15s 时暂停, 显示登录/注册引导
- `requiresPoints` 模式: 显示 "需要 X 积分 (当前 Y 积分)" + 购买引导

### D. 首页文案

`messages/zh.json` 中 `Home.entries.video` 从 "订阅视频" 改为 "教学视频", en/zh-TW 对应更新。

## 改动清单

### 数据库迁移
`supabase/migrations/20260617000000_video_views_and_partner_qr.sql`:
- `ALTER TABLE course_videos ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0`
- `CREATE TABLE video_view_log`
- `ALTER TABLE courses ADD COLUMN partner_qr_url TEXT`
- `ALTER TABLE courses ADD COLUMN partner_qr_label TEXT NOT NULL DEFAULT '合作夥伴'`
- 回填 SQL: 从 user_video_progress 统计写入 view_count

### API
| 文件 | 改动 |
|---|---|
| `src/app/api/courses/video/progress/route.ts` | POST 增加 view_count 计数 (插入 video_view_log + UPDATE course_videos) |
| `src/app/api/courses/[courseId]/videos/route.ts` | GET 返回 view_count, partner_qr_url, partner_qr_label |
| `src/app/api/courses/[courseId]/videos/[videoId]/play/route.ts` | 增加 trial 模式 + 积分检查 + 积分扣除 |
| `src/app/api/admin/courses/[courseId]/videos/route.ts` | GET 返回 view_count; POST 支持上传 QR 图片 |
| `src/lib/points/service.ts` | 新增 `VIDEO_POINTS_COST` 常量和 `consumePointsForVideo()` 函数 |

### 前端
| 文件 | 改动 |
|---|---|
| `src/components/video/VideoPlayerClient.tsx` | 观看人次 + QR 码 + 15s trial + 积分不足提示 |
| `src/components/courses/CourseDetailClient.tsx` | 视频列表显示观看人次 |
| `src/components/admin/AdminCourseDetailClient.tsx` | QR 码上传区域 |

### i18n
| 文件 | 改动 |
|---|---|
| `messages/zh.json` | entries.video → "教学视频", 新增 trial/points 文案 |
| `messages/en.json` | 同上 |
| `messages/zh-TW.json` | 同上 |
