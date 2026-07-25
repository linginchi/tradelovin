import { randomBytes } from "node:crypto";

export {
  KOL_MAX_PLATFORM_ACCOUNTS,
  KOL_OTP_EXPIRE_MINUTES,
  KOL_OTP_SEND_LIMIT_PER_HOUR,
  KOL_PLATFORM_LABELS,
  KOL_PLATFORMS,
  normalizeKolEmail,
  type KolPlatform,
  type PlatformAccount,
} from "@/lib/channel-partner/kol-application-constants";

export function randomKolInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function getOriginFromRequest(request: Request): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (origin) return origin.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
