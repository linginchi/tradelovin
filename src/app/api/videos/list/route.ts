import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabase/service";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

export type VideoListItem = {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  description: string | null;
  duration: number | null;
  sort_order: number;
  is_free_preview: boolean;
  view_count: number;
  topic_id: string | null;
  topic_title: string | null;
  topic_sort_order: number;
  content_kind: string | null;
  published_at: string | null;
};

const UNASSIGNED_SORT = 999_999;

/**
 * 返回所有活跃课程下的视频，扁平化列表（游客可见）。
 * 含主题信息，按主题排序 → 课程 → 视频排序。
 */
export async function GET() {
  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: courses, error: courseErr } = await srv
    .from("courses")
    .select("id, title, topic_id")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (courseErr) {
    return NextResponse.json({ error: courseErr.message }, { status: 500 });
  }

  if (!courses?.length) {
    return NextResponse.json({ videos: [] });
  }

  const topicIds = [
    ...new Set((courses ?? []).map((c) => c.topic_id as string | null).filter(Boolean)),
  ] as string[];

  const topicMap = new Map<string, { title: string; sort_order: number; content_kind: string }>();
  if (topicIds.length > 0) {
    const { data: topics, error: topicErr } = await srv
      .from("course_topics")
      .select("id, title, sort_order, content_kind")
      .in("id", topicIds)
      .eq("is_active", true);

    if (topicErr && !isMissingRelationError(topicErr, "course_topics")) {
      return NextResponse.json({ error: topicErr.message }, { status: 500 });
    }

    for (const tp of topics ?? []) {
      topicMap.set(tp.id as string, {
        title: (tp.title as string) || "—",
        sort_order: (tp.sort_order as number) ?? 0,
        content_kind: (tp.content_kind as string) || "kol",
      });
    }
  }

  type CourseMeta = {
    title: string;
    topic_id: string | null;
    topic_title: string | null;
    topic_sort_order: number;
    content_kind: string | null;
  };

  const courseMap = new Map<string, CourseMeta>();
  for (const c of courses) {
    const cid = c.id as string;
    const tid = (c.topic_id as string | null) ?? null;
    const topic = tid ? topicMap.get(tid) : null;
    courseMap.set(cid, {
      title: (c.title as string) || "—",
      topic_id: tid,
      topic_title: topic?.title ?? null,
      topic_sort_order: topic?.sort_order ?? UNASSIGNED_SORT,
      content_kind: topic?.content_kind ?? null,
    });
  }

  const courseIds = Array.from(courseMap.keys());

  const { data: videos, error: videoErr } = await srv
    .from("course_videos")
    .select(
      "id, course_id, title, description, duration, sort_order, is_free_preview, view_count, published_at",
    )
    .in("course_id", courseIds)
    .lte("published_at", new Date().toISOString())
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (videoErr) {
    if (isMissingRelationError(videoErr, "course_videos")) {
      return NextResponse.json({
        videos: [],
        warning: "视频表尚未初始化，请先执行数据库迁移（course_videos）。",
      });
    }
    return NextResponse.json({ error: videoErr.message }, { status: 500 });
  }

  const items: VideoListItem[] = (videos ?? []).map((v) => {
    const course = courseMap.get(v.course_id as string);
    return {
      id: v.id as string,
      course_id: v.course_id as string,
      course_title: course?.title ?? "—",
      title: (v.title as string) ?? "—",
      description: (v.description as string | null) ?? null,
      duration: (v.duration as number | null) ?? null,
      sort_order: (v.sort_order as number) ?? 0,
      is_free_preview: Boolean(v.is_free_preview),
      view_count: (v.view_count as number) ?? 0,
      topic_id: course?.topic_id ?? null,
      topic_title: course?.topic_title ?? null,
      topic_sort_order: course?.topic_sort_order ?? UNASSIGNED_SORT,
      content_kind: course?.content_kind ?? null,
      published_at: (v.published_at as string | null) ?? null,
    };
  });

  items.sort((a, b) => {
    if (a.topic_sort_order !== b.topic_sort_order) {
      return a.topic_sort_order - b.topic_sort_order;
    }
    if (a.course_id !== b.course_id) {
      return a.course_title.localeCompare(b.course_title, "zh-Hans");
    }
    return a.sort_order - b.sort_order;
  });

  return NextResponse.json({ videos: items });
}
