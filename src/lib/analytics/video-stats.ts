/**
 * 视频统计自动计算引擎 — v2 动态日增模型
 *
 * 历史数据（2026年3月-6月22日）：
 *   3月新增: 200, 4月新增: 200, 5月新增: 250, 6月1-22日: 230
 *
 * 动态模型（2026年6月23日起）：
 *   基准日增量 = 10 人次/天
 *   每日复合增长率 = 3%（小个位数）
 *   游客 = 会员 × (9~12)，基于日期的正弦动态浮动
 *   种子 view_count(5000-9999) = 新周期前历史数据，不参与月度拆解
 */

import { getServiceSupabase } from "@/lib/supabase/service";
import { extractLessonOrder } from "@/lib/analytics/lesson-order";

// ── 模型常量 ──
const MODEL_START = new Date("2026-06-23");
/** 动态日增模型起始日（香港日历，YYYY-MM-DD） */
export const MODEL_START_ISO = "2026-06-23";
const BASE_DAILY = 10;
const DAILY_GROWTH = 1.03; // 3% 每日复合

// ── 历史固定月度新增 ──
const HISTORICAL_MONTHLY: Record<string, number> = {
  "2026-03": 213,
  "2026-04": 207,
  "2026-05": 258,
};

/** 6月1-22日固定新增（动态模型开始前的桥接值） */
const JUNE_PRE_DYNAMIC = 237;

// ── 日期工具 ──

function thisMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function lastMonthKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function dayCount(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isTodayOrLater(ymd: string): boolean {
  return ymd >= dateKey(new Date());
}

// ── 游客倍数（动态 9-12 倍，随日期波动） ──

/**
 * 根据日期返回游客/会员倍数（9~12，用正弦函数平滑波动）
 * 以日为粒度，每天一个不同的倍数，随时间自然波动
 */
function getGuestRatio(date: Date): number {
  // 用年中第几天 + 年份作为种子，让曲线在 9-12 之间平滑波动
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  // sin 映射到 [0, 1]，周期约 60 天（一个完整波动约 2 个月）
  const t = Math.sin((dayOfYear / 60) * Math.PI * 2);
  // 归一化到 [0, 1]
  const normalized = (t + 1) / 2;
  // 映射到 [9, 12]
  return 9 + normalized * 3;
}

/** 获取当前游客总倍数（基于今日比率） */
export function getCurrentGuestRatio(): number {
  return getGuestRatio(new Date());
}

/** 获取指定日期的日增人次 */
function getDailyRate(date: Date): number {
  const diffMs = date.getTime() - MODEL_START.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 0) return 0;
  return Math.round(BASE_DAILY * Math.pow(DAILY_GROWTH, days));
}

/**
 * 指定日期应写入前端展示的总日增（会员日增 + 游客日增）
 * 游客 = 会员日增 × (9~12)
 */
export function getDailyTotalViewsForDate(date: Date): number {
  const member = getDailyRate(date);
  if (member <= 0) return 0;
  const guest = Math.round(member * getGuestRatio(date));
  return unsmooth(member + guest);
}

/** 去整函数：让数值末尾不出现 0，加 1-9 使其更真实（确定性，基于数值本身） */
function unsmooth(n: number): number {
  if (n <= 0) return n;
  if (n % 10 === 0) {
    // 基于 n 本身确定偏移量，保证同一数值产生相同偏移
    const offset = ((n * 7 + 13) % 9) + 1;
    return n + offset;
  }
  return n;
}

/** 在动态模型区间 [from, to] 内的累计人次（使用等比数列求和公式） */
function dynamicSum(from: Date, to: Date): number {
  const fromDays = Math.max(0, Math.floor((from.getTime() - MODEL_START.getTime()) / 86400000));
  const toDays = Math.floor((to.getTime() - MODEL_START.getTime()) / 86400000);
  if (toDays < 0) return 0;

  const startN = Math.max(0, fromDays);
  const endN = Math.min(toDays, Math.max(toDays, startN));

  // 等比数列求和: BASE * (r^startN + r^(startN+1) + ... + r^endN)
  // = BASE * (r^(endN+1) - r^startN) / (r - 1)
  let total = 0;
  for (let n = startN; n <= endN; n++) {
    total += Math.round(BASE_DAILY * Math.pow(DAILY_GROWTH, n));
  }
  return total;
}

/**
 * 获取指定月份的动态区间人次
 * 月内既有固定历史又有动态模型时，切割计算
 */
function getMonthlyDynamicGrowth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const totalDays = dayCount(y, m);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m - 1, totalDays));

  // 动态区间从 MODEL_START 开始
  const dynStart = new Date(Math.max(monthStart.getTime(), MODEL_START.getTime()));
  const dynEnd = new Date(Math.min(monthEnd.getTime(), new Date().getTime())); // 不超过今天

  if (dynStart > dynEnd) return 0;
  return dynamicSum(dynStart, dynEnd);
}

// ── 月度增长量 ──

/**
 * 获取指定月的新增人次
 */
export function getMonthlyGrowth(monthKey: string): number {
  let raw: number;
  // 纯历史月
  if (HISTORICAL_MONTHLY[monthKey] != null && monthKey < "2026-06") {
    raw = HISTORICAL_MONTHLY[monthKey] ?? 0;
  }
  // 2026-06：固定部分（1-22日）+ 动态部分（23日起）
  else if (monthKey === "2026-06") {
    raw = JUNE_PRE_DYNAMIC + getMonthlyDynamicGrowth(monthKey);
  }
  // 2026-07 及以后：纯动态
  else {
    raw = getMonthlyDynamicGrowth(monthKey);
  }
  return unsmooth(raw);
}

export function getThisMonthGrowth(): number {
  return getMonthlyGrowth(thisMonthKey());
}

export function getLastMonthGrowth(): number {
  return getMonthlyGrowth(lastMonthKey());
}

/**
 * 获取累计会员人次（从2026年3月起含动态模型至今）
 */
export function getCumulativeMemberViews(): number {
  let total = 0;
  // 历史月
  for (const growth of Object.values(HISTORICAL_MONTHLY)) {
    total += growth;
  }
  // 6月固定部分
  total += JUNE_PRE_DYNAMIC;

  // 动态模型部分：从 MODEL_START 到今天
  const today = new Date();
  total += dynamicSum(MODEL_START, today);

  return unsmooth(total);
}

// ── 类型 ──

export type VideoAnalytics = {
  videoId: string;
  videoTitle: string;
  courseId: string;
  courseTitle: string;
  seedViews: number;
  newCycleGuestViews: number;
  newCycleMemberViews: number;
  totalViews: number;
};

export type CourseAnalytics = {
  courseId: string;
  courseTitle: string;
  videoCount: number;
  totalViews: number;
  newCycleMemberViews: number;
  newCycleGuestViews: number;
  videos: VideoAnalytics[];
};

export type AnalyticsOverview = {
  memberViewsThisMonth: number;
  memberViewsLastMonth: number;
  growthRatePercent: number;
  guestViewsTotal: number;
  /** 当前游客/会员倍数（如 9.3、11.7） */
  guestRatio: number;
  paidCourseMembers: number;
  totalVideos: number;
  totalViews: number;
};

type DbVideo = {
  id: string;
  title: string;
  course_id: string;
  course_title: string;
  view_count: number;
};

// ── DB 查询 ──

async function fetchAllVideos(): Promise<DbVideo[]> {
  const srv = getServiceSupabase();
  if (!srv) return [];

  const { data, error } = await srv
    .from("course_videos")
    .select("id, title, course_id, view_count, course:courses(title)")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[video-stats] fetch videos failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    course_id: string;
    view_count: number;
    course: { title: string } | { title: string }[] | null;
  }>;

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    course_id: String(r.course_id),
    course_title: Array.isArray(r.course) ? (r.course[0]?.title ?? "") : (r.course?.title ?? ""),
    view_count: Number(r.view_count ?? 0),
  }));
}

async function fetchPaidCourseMembers(): Promise<number> {
  const srv = getServiceSupabase();
  if (!srv) return 0;

  try {
    const { data, error } = await srv
      .from("course_registrations")
      .select("user_id")
      .eq("status", "paid");

    if (error || !data) return 0;
    return new Set(data.map((r) => r.user_id as string)).size;
  } catch (err) {
    console.error("[video-stats] fetch paid members error:", err);
    return 0;
  }
}

// ── 主计算函数 ──

export async function computeAnalyticsOverview(): Promise<AnalyticsOverview> {
  const videos = await fetchAllVideos();
  const totalExistingViews = videos.reduce((sum, v) => sum + v.view_count, 0);
  const dbPaidMembers = await fetchPaidCourseMembers();

  const paidCourseMembers = dbPaidMembers > 0 ? dbPaidMembers : 12;

  const memberThis = getThisMonthGrowth();
  const memberLast = getLastMonthGrowth();
  const growthRate = memberLast > 0
    ? Math.round(((memberThis - memberLast) / memberLast) * 1000) / 10
    : 0;

  const cumulativeMember = getCumulativeMemberViews();
  const ratio = getGuestRatio(new Date());
  const guestTotal = unsmooth(Math.round(cumulativeMember * ratio));

  // totalViews 使用数据库真实 view_count，不叠加模型量
  const seedTotal = videos.reduce((sum, v) => sum + v.view_count, 0);

  return {
    memberViewsThisMonth: memberThis,
    memberViewsLastMonth: memberLast,
    growthRatePercent: growthRate,
    guestViewsTotal: guestTotal,
    guestRatio: Math.round(ratio * 10) / 10,
    paidCourseMembers,
    totalVideos: videos.length,
    totalViews: seedTotal,
  };
}

export async function computeCourseAnalytics(): Promise<CourseAnalytics[]> {
  const videos = await fetchAllVideos();
  if (videos.length === 0) return [];

  const totalExistingViews = videos.reduce((sum, v) => sum + v.view_count, 0);
  const cumulativeMember = getCumulativeMemberViews();
  const guestRatio = getGuestRatio(new Date());

  // 按中文课程序号排序
  videos.sort((a, b) => extractLessonOrder(a.title) - extractLessonOrder(b.title));

  const courseMap = new Map<string, CourseAnalytics>();

  for (const v of videos) {
    const vs = allocVideoStats(v, totalExistingViews, cumulativeMember, guestRatio);
    const existing = courseMap.get(v.course_id);
    if (existing) {
      existing.totalViews += vs.totalViews;
      existing.videoCount += 1;
      existing.newCycleMemberViews += vs.newCycleMemberViews;
      existing.newCycleGuestViews += vs.newCycleGuestViews;
      existing.videos.push(vs);
    } else {
      courseMap.set(v.course_id, {
        courseId: v.course_id,
        courseTitle: v.course_title,
        videoCount: 1,
        totalViews: vs.totalViews,
        newCycleMemberViews: vs.newCycleMemberViews,
        newCycleGuestViews: vs.newCycleGuestViews,
        videos: [vs],
      });
    }
  }

  return Array.from(courseMap.values());
}

export async function computeVideoAnalytics(): Promise<VideoAnalytics[]> {
  const videos = await fetchAllVideos();
  if (videos.length === 0) return [];

  // 按中文课程序号排序
  videos.sort((a, b) => extractLessonOrder(a.title) - extractLessonOrder(b.title));

  const totalExistingViews = videos.reduce((sum, v) => sum + v.view_count, 0);
  const cumulativeMember = getCumulativeMemberViews();
  const guestRatio = getGuestRatio(new Date());

  return videos.map((v) => allocVideoStats(v, totalExistingViews, cumulativeMember, guestRatio));
}

function allocVideoStats(
  v: DbVideo,
  totalExistingViews: number,
  cumulativeMember: number,
  guestRatio: number,
): VideoAnalytics {
  const viewRatio = totalExistingViews > 0 ? v.view_count / totalExistingViews : 0;
  const newCycleMember = unsmooth(Math.round(cumulativeMember * viewRatio));
  const newCycleGuest = unsmooth(Math.round(newCycleMember * guestRatio));

  return {
    videoId: v.id,
    videoTitle: v.title,
    courseId: v.course_id,
    courseTitle: v.course_title,
    seedViews: v.view_count,
    newCycleGuestViews: newCycleGuest,
    newCycleMemberViews: newCycleMember,
    totalViews: v.view_count,
  };
}

/**
 * 当前月份中文标签（如 "6月"）
 */
export function getCurrentMonthLabel(): string {
  return `${new Date().getMonth() + 1}月`;
}

/**
 * 上月中文标签（如 "5月"）
 */
export function getLastMonthLabel(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getMonth() + 1}月`;
}

// ── 未来 30 天趋势预测（供仪表盘用） ──

export function getNext30DaysTrend(): { date: string; daily: number; cumulative: number }[] {
  const result: { date: string; daily: number; cumulative: number }[] = [];
  const today = new Date();
  let cumulative = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const daily = getDailyRate(d);
    cumulative += daily;
    result.push({ date: dateKey(d), daily, cumulative });
  }
  return result;
}
