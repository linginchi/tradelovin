/** 影片觀看配額 — 會員等級對應每月可用分鐘數 */
import type { MembershipLevel } from "./level-mapping";

export const VIDEO_QUOTA_MINUTES: Record<string, number> = {
  T0_trial: 0,        // 試用期不給完整播放，走 10 秒試看
  T0_paid: 40,        // 已棄用（不對外開放），邏輯保留以備復用
  T1: 200,            // 雪豹入門檔：每月約 200 分鐘
  T2: Infinity,       // 雲豹高階檔：全庫無限
  T3: Infinity,       // 金錢豹高階檔：全庫無限
};

export function getQuotaSeconds(plan: string): number {
  const minutes = VIDEO_QUOTA_MINUTES[plan] ?? 0;
  return minutes === Infinity ? Infinity : minutes * 60;
}

export function getLevelQuotaLabel(level: MembershipLevel, locale: string): string {
  const minutes = VIDEO_QUOTA_MINUTES[level.plan];
  if (minutes === Infinity) {
    return locale === "en" ? "Unlimited" : locale === "zh-TW" ? "無限制" : "无限制";
  }
  const label = locale === "en" ? `${minutes} min/mo` : locale === "zh-TW" ? `每月${minutes}分鐘` : `每月${minutes}分钟`;
  return label;
}
