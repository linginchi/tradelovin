"use client";

import { Bot, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type PipelineJob = {
  id: string;
  source_url: string;
  source_platform: string;
  status: string;
  target_video_ids: string[];
  segment_count: number;
  error_log: string | null;
  created_at: string;
};

type RedbookArticle = {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  published_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-500",
  downloading: "bg-blue-500",
  transcribing: "bg-indigo-500",
  translating: "bg-purple-500",
  generating_tts: "bg-violet-500",
  compositing: "bg-pink-500",
  uploading: "bg-orange-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  downloading: "下载中",
  transcribing: "转写中",
  translating: "翻译分段",
  generating_tts: "语音生成",
  compositing: "视频合成",
  uploading: "上传中",
  completed: "已完成",
  failed: "失败",
};

export default function AdminAiPipelinePanel() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [articles, setArticles] = useState<RedbookArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceUrl, setSourceUrl] = useState("");
  const [courseId, setCourseId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [jRes, aRes] = await Promise.all([
        fetch("/api/admin/ai-pipeline"),
        fetch("/api/admin/redbook-articles"),
      ]);
      if (jRes.ok) setJobs(((await jRes.json() as { jobs?: PipelineJob[] }).jobs ?? []));
      if (aRes.ok) setArticles(((await aRes.json() as { articles?: RedbookArticle[] }).articles ?? []));
    } catch {
      setMsg("加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const triggerPipeline = async () => {
    if (!sourceUrl || !courseId) { setMsg("请填写视频 URL 和课程 ID"); return; }
    setSubmitting(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/ai-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, course_id: courseId, source_platform: "youtube" }),
      });
      if (res.ok) { setMsg("任务已创建"); setSourceUrl(""); void fetchData(); }
      else setMsg((await res.json() as { error?: string }).error ?? "创建失败");
    } catch {
      setMsg("请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  const approveArticle = async (id: string, status: "reviewed" | "published") => {
    try {
      await fetch("/api/admin/redbook-articles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      void fetchData();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-8">
      <Card className="border-border/60 bg-card/35">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-5" />触发 AI 视频加工</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-source-url">视频 URL (YouTube)</Label>
              <Input id="ai-source-url" placeholder="https://www.youtube.com/watch?v=..." value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-course-id">目标课程 ID</Label>
              <Input id="ai-course-id" placeholder="UUID" value={courseId} onChange={(e) => setCourseId(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" disabled={submitting} onClick={() => void triggerPipeline()}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}创建加工任务
            </Button>
            {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">任务创建后需在 GitHub Actions 中执行，或本地运行: node scripts/ai-pipeline/process-video.mjs</p>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/35">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">加工任务队列</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => void fetchData()}><RefreshCw className="size-4" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />加载中...</div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无任务</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-lg border border-border/40 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block size-2 rounded-full ${STATUS_COLORS[job.status] ?? "bg-gray-400"}`} />
                      <span className="truncate max-w-[300px]">{job.source_url}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{STATUS_LABELS[job.status] ?? job.status}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                  </div>
                  {job.error_log ? <p className="mt-1 text-xs text-red-400 truncate">{job.error_log}</p> : null}
                  {job.target_video_ids?.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">已生成 {job.segment_count} 个片段, IDs: {job.target_video_ids.slice(0, 3).join(", ")}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/35">
        <CardHeader><CardTitle className="text-base">小红书文章草稿</CardTitle></CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无文章</p>
          ) : (
            <ul className="space-y-3">
              {articles.map((a) => (
                <li key={a.id} className="rounded-lg border border-border/40 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{a.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{a.status === "draft" ? "草稿" : a.status === "reviewed" ? "已审核" : "已发布"}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-2">{a.content}</p>
                  <div className="flex gap-2">
                    {a.status === "draft" ? (
                      <Button size="sm" variant="outline" onClick={() => void approveArticle(a.id, "reviewed")}>审核通过</Button>
                    ) : a.status === "reviewed" ? (
                      <Button size="sm" variant="outline" onClick={() => void approveArticle(a.id, "published")}>标记已发布</Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
