export const KOL_PLATFORMS = [
  "xiaohongshu",
  "douyin",
  "weibo",
  "bilibili",
  "youtube",
  "instagram",
  "twitter",
  "other",
] as const;

export type KolPlatform = (typeof KOL_PLATFORMS)[number];

export type PlatformAccount = {
  platform: KolPlatform;
  account: string;
};

export const KOL_OTP_EXPIRE_MINUTES = 10;
export const KOL_OTP_SEND_LIMIT_PER_HOUR = 5;
export const KOL_MAX_PLATFORM_ACCOUNTS = 3;

export const KOL_PLATFORM_LABELS: Record<KolPlatform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  weibo: "微博",
  bilibili: "B站",
  youtube: "YouTube",
  instagram: "Instagram",
  twitter: "Twitter/X",
  other: "其他",
};

export function normalizeKolEmail(email: string): string {
  return email.trim().toLowerCase();
}
