"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Eye,
  Loader2,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type TrendItem = { date: string; daily: number; cumulative: number };

type CompletedMonth = {
  month: string;
  label: string;
  memberGrowth: number;
};

type Overview = {
  memberViewsThisMonth: number;
  memberViewsLastMonth: number;
  growthRatePercent: number;
  guestViewsTotal: number;
  guestRatio: number;
  paidCourseMembers: number;
  totalVideos: number;
  totalViews: number;
  completedMonths: CompletedMonth[];
  monthLabel: string;
  lastMonthLabel: string;
};

type VideoStat = {
  videoId: string;
  videoTitle: string;
  courseId: string;
  courseTitle: string;
  seedViews: number;
  newCycleGuestViews: number;
  newCycleMemberViews: number;
  totalViews: number;
};

type CourseStat = {
  courseId: string;
  courseTitle: string;
  videoCount: number;
  totalViews: number;
  newCycleMemberViews: number;
  newCycleGuestViews: number;
  videos: VideoStat[];
};

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return n.toLocaleString("zh-CN");
  const wan = n / 10000;
  if (wan < 10) return `${wan.toFixed(1)}万`;
  return `${Math.round(wan)}万`;
}

export function AdminAnalyticsDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [courses, setCourses] = useState<CourseStat[]>([]);
  const [videos, setVideos] = useState<VideoStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "courses" | "videos">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, co, vi] = (await Promise.all([
        fetch("/api/admin/analytics/overview", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/analytics/courses", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/analytics/videos", { credentials: "include" }).then((r) => r.json()),
      ])) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
      if (ov.error) throw new Error(String(ov.error));
      setOverview(ov as unknown as Overview);
      setCourses(((co as unknown as { courses: CourseStat[] }).courses) ?? []);
      setVideos(((vi as unknown as { videos: VideoStat[] }).videos) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-cyan-400/70" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/35 p-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!overview) return null;

  const growthColor =
    overview.growthRatePercent >= 0 ? "text-green-400" : "text-red-400";

  // 月度数据
  const maxMonthly = Math.max(...overview.completedMonths.map((m) => m.memberGrowth), 1);

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-cyan-500/15">
            <BarChart3 className="size-6 text-cyan-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#e8e8ed]">
              视频统计分析
            </h1>
            <p className="mt-1 text-sm text-[#8b8b9e]">
              教学视频观看数据总览与趋势
            </p>
          </div>
        </div>
      </header>

      {/* Tab 切换 */}
      <div className="flex gap-1 rounded-lg border border-border/60 bg-card/25 p-1 w-fit">
        {(
          [
            ["overview", "总览"],
            ["courses", "按课程"],
            ["videos", "按视频"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                : "text-[#8b8b9e] hover:text-[#e8e8ed]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 总览 */}
      {tab === "overview" && (
        <>
          {/* 核心指标卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={`会员${overview.monthLabel}浏览增长量`}
              value={fmt(overview.memberViewsThisMonth)}
              icon={TrendingUp}
              accent="cyan"
              subtitle={`上月(${overview.lastMonthLabel}) ${fmt(overview.memberViewsLastMonth)}`}
            />
            <MetricCard
              label="增长率"
              value={
                <span className={growthColor}>
                  {overview.growthRatePercent >= 0 ? "+" : ""}
                  {overview.growthRatePercent}%
                </span>
              }
              icon={TrendingUp}
              accent="green"
              subtitle={`上月(${overview.lastMonthLabel}) → 本月(${overview.monthLabel})`}
            />
            <MetricCard
              label={`游客浏览量（${overview.monthLabel}）`}
              value={fmt(overview.guestViewsTotal)}
              icon={Eye}
              accent="amber"
              subtitle={`${overview.monthLabel}累计`}
            />
            <MetricCard
              label="录播买课会员人数"
              value={fmt(overview.paidCourseMembers)}
              icon={UserCheck}
              accent="purple"
              subtitle={`${overview.totalVideos} 个视频 · ${overview.monthLabel}`}
            />
          </div>

          {/* 底部信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border/60 bg-card/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#e8e8ed]">总浏览次数</CardTitle>
                <CardDescription>所有视频的 view_count 总和</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl tabular-nums text-[#e8e8ed]">
                  {fmt(overview.totalViews)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/25">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[#e8e8ed]">每月会员浏览增长量</CardTitle>
                <CardDescription>已完成月份 · 月底更新</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4 h-28 pt-2">
                  {overview.completedMonths.map((m) => {
                    const h = (m.memberGrowth / maxMonthly) * 100;
                    return (
                      <div key={m.month} className="flex min-w-[48px] flex-1 flex-col items-center gap-1">
                        <span className="font-mono text-[10px] tabular-nums leading-none text-[#e8e8ed]">
                          {m.memberGrowth}
                        </span>
                        <div
                          className="w-full rounded-t-sm bg-cyan-500/40 transition-all"
                          style={{ height: `${h}%` }}
                        />
                        <span className="text-[10px] text-[#8b8b9e]">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* 按课程 */}
      {tab === "courses" && (
        <div className="space-y-3">
          {courses.map((c) => (
            <Card key={c.courseId} className="border-border/60 bg-card/25">
              <button
                type="button"
                onClick={() =>
                  setExpandedCourse(
                    expandedCourse === c.courseId ? null : c.courseId,
                  )
                }
                className="w-full text-left"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm text-[#e8e8ed]">
                        {c.courseTitle || "未命名课程"}
                      </CardTitle>
                      <CardDescription>
                        {c.videoCount} 个视频 · 总观看 {fmt(c.totalViews)} · 会员 {fmt(c.newCycleMemberViews)} · 游客 {fmt(c.newCycleGuestViews)}（{overview.monthLabel}）
                      </CardDescription>
                    </div>
                    <span className={cn(
                      "text-xs transition-transform text-[#8b8b9e]",
                      expandedCourse === c.courseId && "rotate-180",
                    )}>
                      ▼
                    </span>
                  </div>
                </CardHeader>
              </button>
              {expandedCourse === c.courseId && (
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>视频</TableHead>
                        <TableHead className="text-right">历史</TableHead>
                        <TableHead className="text-right">会员({overview.monthLabel})</TableHead>
                        <TableHead className="text-right">游客({overview.monthLabel})</TableHead>
                        <TableHead className="text-right">总计</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.videos.map((v) => (
                        <TableRow key={v.videoId}>
                          <TableCell className="max-w-[200px] truncate text-sm text-[#e8e8ed]">
                            {v.videoTitle}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-[#8b8b9e]">
                            {fmt(v.seedViews)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-cyan-300">
                            {fmt(v.newCycleMemberViews)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-amber-300">
                            {fmt(v.newCycleGuestViews)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-[#e8e8ed]">
                            {fmt(v.totalViews)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          ))}
          {courses.length === 0 && (
            <p className="py-8 text-center text-sm text-[#5c5c6e]">暂无课程数据</p>
          )}
        </div>
      )}

      {/* 按视频 */}
      {tab === "videos" && (
        <div className="rounded-xl border border-border/60 bg-card/25 ring-1 ring-foreground/5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>视频</TableHead>
                <TableHead>所属课程</TableHead>
                <TableHead className="text-right">历史</TableHead>
                <TableHead className="text-right">会员({overview.monthLabel})</TableHead>
                <TableHead className="text-right">游客({overview.monthLabel})</TableHead>
                <TableHead className="text-right">总计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-[#5c5c6e]">
                    暂无视频数据
                  </TableCell>
                </TableRow>
              ) : (
                videos.map((v) => (
                  <TableRow key={v.videoId}>
                    <TableCell className="max-w-[240px] truncate text-sm text-[#e8e8ed]">
                      {v.videoTitle}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-[#8b8b9e]">
                      {v.courseTitle || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-[#8b8b9e]">
                      {fmt(v.seedViews)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-cyan-300">
                      {fmt(v.newCycleMemberViews)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-amber-300">
                      {fmt(v.newCycleGuestViews)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-[#e8e8ed]">
                      {fmt(v.totalViews)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  subtitle,
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof TrendingUp;
  accent: "cyan" | "green" | "amber" | "purple";
  subtitle: string;
}) {
  const accentColors = {
    cyan: "bg-cyan-500/15 text-cyan-400",
    green: "bg-green-500/15 text-green-400",
    amber: "bg-amber-500/15 text-amber-400",
    purple: "bg-purple-500/15 text-purple-400",
  };

  return (
    <Card className="border-border/60 bg-card/25">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-[#8b8b9e]">
          {label}
        </CardTitle>
        <div className={cn("flex size-8 items-center justify-center rounded-lg", accentColors[accent])}>
          <Icon className="size-4" aria-hidden />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl tabular-nums text-[#e8e8ed]">
          {value}
        </div>
        <p className="mt-1 text-xs text-[#5c5c6e]">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
