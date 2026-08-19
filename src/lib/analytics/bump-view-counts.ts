/**
 * 将动态日增模型写回 course_videos.view_count
 * （此前仅用于后台 analytics 计算，前端看不到增长）
 *
 * 幂等日志优先写入 view_count_bump_log；若表尚未迁移，回退到 tq_config。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getDailyTotalViewsForDate, MODEL_START_ISO } from "@/lib/analytics/video-stats";

const CONFIG_KEY = "view_count_bump_log";

function hkDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function eachDayInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

type VideoRow = { id: string; view_count: number | null };

function allocate(total: number, videos: VideoRow[]): Map<string, number> {
  const map = new Map<string, number>();
  if (videos.length === 0 || total <= 0) return map;

  const weights = videos.map((v) => Math.max(1, Number(v.view_count ?? 0)));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let assigned = 0;
  const floats: { id: string; exact: number }[] = videos.map((v, i) => ({
    id: v.id,
    exact: (total * weights[i]) / weightSum,
  }));

  for (const row of floats) {
    const n = Math.floor(row.exact);
    map.set(row.id, n);
    assigned += n;
  }

  let remain = total - assigned;
  const ranked = [...floats].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (const row of ranked) {
    if (remain <= 0) break;
    map.set(row.id, (map.get(row.id) ?? 0) + 1);
    remain -= 1;
  }
  return map;
}

type DayMeta = { total_added: number; meta?: Record<string, unknown> };

async function loadDoneDates(srv: SupabaseClient): Promise<{
  done: Set<string>;
  mode: "table" | "config";
  configMap: Record<string, DayMeta>;
}> {
  const { data: doneRows, error: doneErr } = await srv
    .from("view_count_bump_log")
    .select("bump_date")
    .gte("bump_date", MODEL_START_ISO);

  if (!doneErr) {
    return {
      done: new Set((doneRows ?? []).map((r) => String(r.bump_date).slice(0, 10))),
      mode: "table",
      configMap: {},
    };
  }

  const { data: cfg, error: cfgErr } = await srv
    .from("tq_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();

  if (cfgErr) {
    throw new Error(`无法读取 bump 日志（表未迁移且 tq_config 不可用）: ${cfgErr.message}`);
  }

  const raw = (cfg?.value ?? {}) as { dates?: Record<string, DayMeta> };
  const configMap = raw.dates ?? {};
  return {
    done: new Set(Object.keys(configMap)),
    mode: "config",
    configMap,
  };
}

async function markDayDone(
  srv: SupabaseClient,
  mode: "table" | "config",
  ymd: string,
  totalAdded: number,
  meta: Record<string, unknown>,
  configMap: Record<string, DayMeta>,
): Promise<"ok" | "conflict"> {
  if (mode === "table") {
    const { error } = await srv.from("view_count_bump_log").insert({
      bump_date: ymd,
      total_added: totalAdded,
      meta,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return "conflict";
      throw new Error(error.message);
    }
    return "ok";
  }

  configMap[ymd] = { total_added: totalAdded, meta };
  const { error } = await srv.from("tq_config").upsert({
    key: CONFIG_KEY,
    value: { dates: configMap },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return "ok";
}

export type BumpResult = {
  bumpedDates: string[];
  skippedDates: string[];
  totalAdded: number;
  videoUpdates: number;
  logMode: "table" | "config";
};

/**
 * 补跑 MODEL_START → 今天（香港）未写入的日增。
 * 已写入的日期会跳过，保证幂等。
 */
export async function bumpViewCountsCatchUp(srv: SupabaseClient): Promise<BumpResult> {
  const today = hkDateKey();
  const from = MODEL_START_ISO;
  const days = eachDayInclusive(from, today);

  const { done, mode, configMap } = await loadDoneDates(srv);
  const pending = days.filter((d) => !done.has(d));

  const result: BumpResult = {
    bumpedDates: [],
    skippedDates: days.filter((d) => done.has(d)),
    totalAdded: 0,
    videoUpdates: 0,
    logMode: mode,
  };

  if (pending.length === 0) return result;

  const { data: videos, error: vErr } = await srv
    .from("course_videos")
    .select("id, view_count, published_at")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString());

  if (vErr) throw new Error(vErr.message);

  let working: VideoRow[] = (videos ?? []).map((v) => ({
    id: v.id as string,
    view_count: (v.view_count as number | null) ?? 0,
  }));

  if (working.length === 0) {
    for (const ymd of pending) {
      const status = await markDayDone(srv, mode, ymd, 0, { note: "no published videos" }, configMap);
      if (status === "ok") result.bumpedDates.push(ymd);
    }
    return result;
  }

  for (const ymd of pending) {
    const [yy, mm, dd] = ymd.split("-").map(Number);
    const modelDate = new Date(Date.UTC(yy, mm - 1, dd, 4, 0, 0)); // 04:00 UTC = 12:00 HKT
    const total = getDailyTotalViewsForDate(modelDate);
    if (total <= 0) {
      const status = await markDayDone(srv, mode, ymd, 0, { note: "before model start" }, configMap);
      if (status === "ok") result.bumpedDates.push(ymd);
      continue;
    }

    const alloc = allocate(total, working);
    let dayAdded = 0;
    let updates = 0;

    for (const [videoId, add] of alloc) {
      if (add <= 0) continue;
      const current = working.find((w) => w.id === videoId)?.view_count ?? 0;
      const next = Number(current) + add;
      const { error: uErr } = await srv
        .from("course_videos")
        .update({ view_count: next })
        .eq("id", videoId);
      if (uErr) throw new Error(uErr.message);
      const row = working.find((w) => w.id === videoId);
      if (row) row.view_count = next;
      dayAdded += add;
      updates += 1;
    }

    const status = await markDayDone(
      srv,
      mode,
      ymd,
      dayAdded,
      { videoUpdates: updates, modelTotal: total },
      configMap,
    );
    if (status === "conflict") {
      result.skippedDates.push(ymd);
      continue;
    }

    result.bumpedDates.push(ymd);
    result.totalAdded += dayAdded;
    result.videoUpdates += updates;
  }

  return result;
}
