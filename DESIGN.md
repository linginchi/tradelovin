# Design System — Tradelovin 竖屏视频播放器

## Product Context
- **What this is:** Tradelovin 交易教学平台中「豹哥/豹叔」（ai_classic）视频的竖屏播放器。
- **Who it's for:** 华人交易学习者，通过手机为主要观看设备。
- **Space/industry:** 在线教育 / 交易教学。
- **Project type:** Web 应用内嵌视频播放器，移动优先。

## Aesthetic Direction
- **Direction:** Editorial/Mobile-First — 干净、高对比度、信息分层清晰。
- **Decoration level:** Intentional — 视频区纯黑背景，信息区半透明卡片，不与视频叠加。
- **Mood:** 专注学习，不受干扰。教学视频不应像社交媒体那样把按钮堆叠在画面上。
- **Core differentiation:** 信息完全剥离视频区 — 观看人数、积分、QR 码全部放在视频下方的独立卡片区，而非叠加在视频上。这是 tradelovin 作为教学平台与 TikTok/小红书等社交视频平台的核心区别。

## Typography
- **Display/Hero:** Noto Sans SC Bold 700 — 视频标题、课程名称。中英文混排优秀，字重饱满。
- **Body:** Noto Sans SC Regular 400 — 信息栏文字、描述、积分提示。14px / line-height 1.7。
- **UI/Labels:** Noto Sans SC Medium 500 — 按钮、标签、状态徽章。12px / letter-spacing 0.02em。
- **Data/Tables:** DM Mono — 进度条时间码 (`02:15 / 12:30`)、数字对齐。支持 tabular-nums。
- **Loading:** Google Fonts CDN。
- **Scale:**
  - xs: 10px (辅助信息、图表注解)
  - sm: 12px (标签、UI 文字、时间码)
  - base: 14px (正文、信息显示)
  - lg: 16px (卡片标题)
  - xl: 18px (区块标题)
  - 2xl: 22-24px (页面标题)
  - 3xl: 28px (大标题)

## Color
- **Approach:** Restrained — 单一 accent 色 + 中性灰暗色系。颜色使用克制，仅在需要强调时出现。
- **Primary accent:** `#22d3ee` (cyan-400) — 强调色，用于进度条激活态、积分消耗提示、active tab 下划线。
- **Secondary accent:** `#06b6d4` (cyan-500) — 强调色的加深版本，用于 hover/active 状态。
- **Warning:** `#fbbf24` (amber-400) — 试看提示、谨慎操作确认。`#d97706` (amber-600) 加深版用于 hover。
- **Success:** `#34d399` (green-400) — 成功状态、已消耗积分。
- **Error:** `#f87171` (red-400) — 错误状态、积分不足。
- **Neutrals (dark theme):**
  - Background: `#0a0a0f` — 页面最深底色。
  - Surface: `#13131a` — 卡片底色、信息区背景。
  - Surface Elevated: `#1a1a24` — 高亮卡片、hover 态。
  - Border: `rgba(255,255,255,0.08)` — 默认边框。
  - Border Strong: `rgba(255,255,255,0.12)` — 强调边框、hover 边框。
  - Text Primary: `#e8e8ed` — 主文字。
  - Text Secondary: `#8b8b9e` — 辅助文字。
  - Text Muted: `#5c5c6e` — 弱化文字。
- **Dark mode:** 默认即暗色模式。亮色模式不需要优先支持（视频播放天然适配暗色）。
- **Note:** 这些颜色与项目现有 Tailwind CSS 变量体系部分重叠。实施时优先使用现有 CSS 变量，仅色值冲突时新增。

## Spacing
- **Base unit:** 4px（Tailwind 默认）。
- **Density:** Comfortable — 信息卡片区间距 10-16px，按钮内边距 8px。
- **Scale:** gap-2(8px) gap-3(12px) gap-4(16px) p-3(12px) p-4(16px) py-8(32px)。
- **Border radius:** sm: 6px (卡片内部元素), md: 10px (信息卡片), lg: 14px (视频外容器), full: 9999px (按钮/标签)。

## Layout — 竖屏播放器

### 整体结构（自上而下）
```
┌─────────────────────────┐
│  返回按钮（左上浮层）     │  ← absolute top-3 left-3 z-10
├─────────────────────────┤
│                         │
│  视频区                  │  ← aspect-[9/16] w-full bg-black rounded-xl
│  - 桌面: max-w-sm mx-auto│     overflow-hidden
│  - 手机: w-full          │
│  - 视频内无信息叠加       │
│                         │
├─────────────────────────┤
│  信息卡片区               │  ← space-y-3 p-4 bg-card/60 rounded-xl
│  👁 观看人数              │
│  ⚠ 试看提示 / 积分状态    │
│  📱 开户二维码（可选）    │
└─────────────────────────┘
```

### 各元素详细规则

| 元素 | 位置 | Tailwind 类 | 备注 |
|---|---|---|---|
| 视频容器 | 上半部分 | `aspect-[9/16] w-full bg-black rounded-xl overflow-hidden` | 桌面端加 `max-w-sm mx-auto` |
| 返回按钮 | 视频区左上浮层 | `absolute top-3 left-3 z-10` | 半透黑底 `bg-black/40 backdrop-blur-sm` |
| 视频元素 | 容器内 | `w-full h-full object-contain` | `playsInline controls` |
| 字幕 | 视频区内、居中 | 中心 60% 垂直区域 | 两种模式：(a) hard-coded (b) `<track>` 元素 |
| 观看人数 | 信息卡片第一行 | `flex gap-2 text-xs text-muted-foreground` | Eye icon + 数字 |
| 试看提示 | 信息卡片第二行 | `text-amber-300` | 仅试看模式显示 |
| 积分状态 | 信息卡片第二行 | `text-cyan-300`（已消耗）/ `text-amber-300`（需积分）| 仅需积分模式显示 |
| QR 码 | 信息卡片底部 | `w-24 mx-auto rounded-lg border` | 可选显示 |

### 屏幕适配规则

| 断点 | 视频宽度 | 信息区 | 备注 |
|---|---|---|---|
| Mobile (< 640px) | `w-full`, `max-h-[80vh]` | 全宽 | 视频不超出视口 |
| Tablet (640-1024px) | `max-w-sm` (384px), `mx-auto` | 居中，跟随视频宽度 | |
| Desktop (> 1024px) | `max-w-sm` (384px), `mx-auto` | 居中，跟随视频宽度 | 两边留暗色背景 |

### Safe Area

- 始终使用 `viewport-fit=cover` meta 标签。
- 返回按钮位置：`top-[calc(env(safe-area-inset-top,0px)+12px)] left-[calc(env(safe-area-inset-left,0px)+12px)]`。
- 底部控件：容器 `pb-[env(safe-area-inset-bottom,0px)]`。

## Motion
- **Approach:** Minimal-functional — 仅保留对理解有益的状态过渡。
- **Video load:** 旋转加载动画（现有 spinner），150ms fade-in。
- **信息卡片:** 无入场动画，静态呈现。
- **返回按钮:** `transition-colors` 仅 hover 态。

## 与现有播放器的关系

此设计规范**仅适用于** `content_kind === 'ai_classic'`（豹哥/豹叔）的视频。
KOL 类视频（`content_kind === 'kol'`）保持现有横向/自适应布局，不受此规范影响。

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-18 | 初始设计系统建立 | By design-consultation skill，基于 TikTok/YouTube Shorts/小红书竞品研究 |
| 2026-06-18 | 信息完全剥离视频区 | 教学视频不需要社交按钮叠加在画面上，与社交平台差异化 |
| 2026-06-18 | 桌面端 max-w-sm 保留竖屏比例 | 桌面和手机端视觉一致，不强制拉伸为宽屏 |
| 2026-06-18 | 原生 `<video controls>` 优先 | 避免维护手势冲突，完美支持所有平台和辅助技术 |
| 2026-06-18 | 字体选 Noto Sans SC | 中英文混排优秀，Google Fonts CDN 免费可用 |
