"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type ProgressResponse = {
  position?: number;
  completed?: boolean;
};

export function VideoPlayerClient() {
  const search = useSearchParams();
  const courseId = search.get("courseId") ?? "";
  const videoId = search.get("videoId") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  // One POST attempt per loaded video: real play starts counting; failures stay silent.
  const viewReportStateRef = useRef<"idle" | "pending" | "done">("idle");

  const playApi = useMemo(() => {
    if (!courseId || !videoId) return "";
    return `/api/courses/${encodeURIComponent(courseId)}/videos/${encodeURIComponent(videoId)}/play`;
  }, [courseId, videoId]);

  async function reportViewOnPlay() {
    if (!playApi || viewReportStateRef.current !== "idle") return;
    viewReportStateRef.current = "pending";
    try {
      const res = await fetch(playApi, { method: "POST", credentials: "include" });
      // Guests and already-counted windows return { counted: false }; never surface that.
      if (!res.ok) {
        try {
          await res.json();
        } catch {
          /* ignore non-JSON error bodies */
        }
      }
    } catch {
      // Counting must never interrupt playback.
    } finally {
      viewReportStateRef.current = "done";
    }
  }

  async function reportProgress(forceCompleted = false) {
    const el = videoRef.current;
    if (!el || !videoId) return;
    const position = Math.max(0, Math.floor(el.currentTime || 0));
    await fetch("/api/courses/video/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        videoId,
        position,
        completed: forceCompleted || (el.duration > 0 && position >= Math.floor(el.duration - 1)),
      }),
    });
  }

  useEffect(() => {
    let alive = true;
    viewReportStateRef.current = "idle";
    async function run() {
      if (!playApi || !videoId) {
        setError("参数错误");
        setLoading(false);
        return;
      }

      try {
        // GET only issues a signed URL; counting waits for the browser play event.
        const [playRes, progressRes] = await Promise.all([
          fetch(playApi, { credentials: "include" }),
          fetch(`/api/courses/video/progress?videoId=${encodeURIComponent(videoId)}`, {
            credentials: "include",
          }),
        ]);
        const playJson = (await playRes.json()) as { playUrl?: string; error?: string };
        const progressJson = (await progressRes.json()) as ProgressResponse;
        if (!alive) return;

        if (!playRes.ok || !playJson.playUrl) {
          setError(playJson.error ?? "无权限观看，请先购买课程");
          setLoading(false);
          return;
        }

        setPlayUrl(playJson.playUrl);
        setLoading(false);

        window.setTimeout(() => {
          const el = videoRef.current;
          if (!el) return;
          const saved = Number(progressJson.position ?? 0);
          if (saved > 0 && Number.isFinite(saved)) {
            el.currentTime = saved;
          }
        }, 300);
      } catch {
        if (!alive) return;
        setError("加载播放地址失败");
        setLoading(false);
      }
    }
    void run();

    return () => {
      alive = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      void reportProgress(false);
    };
  }, [playApi, videoId]);

  useEffect(() => {
    if (!playUrl) return;
    timerRef.current = window.setInterval(() => {
      void reportProgress(false);
    }, 10_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [playUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> 视频加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 rounded-xl border border-border/70 bg-card/35 p-6">
        <p className="text-sm text-amber-300">{error}</p>
        <Link href="/courses" className={cn(buttonVariants({ variant: "outline" }))}>
          返回课程列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        controls
        playsInline
        className="w-full rounded-xl border border-border/60 bg-black"
        src={playUrl}
        onPlay={() => {
          void reportViewOnPlay();
        }}
        onEnded={() => {
          void reportProgress(true);
        }}
      />
      <p className="text-muted-foreground text-xs">
        播放地址为临时签名 URL（15 分钟有效）。系统会每 10 秒自动保存观看进度。
      </p>
    </div>
  );
}
