import { NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { isMissingRelationError } from "@/lib/video/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  videoId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  completed: z.boolean().optional(),
});

export async function GET(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId");
  if (!videoId || !z.string().uuid().safeParse(videoId).success) {
    return NextResponse.json({ error: "videoId 无效" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data, error } = await srv
    .from("user_video_progress")
    .select("last_position, completed")
    .eq("user_id", auth.userId)
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "user_video_progress")) {
      return NextResponse.json(
        { position: 0, completed: false, warning: "观看进度表未初始化，请先执行数据库迁移。" },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    position: Number(data?.last_position ?? 0),
    completed: Boolean(data?.completed),
  });
}

export async function POST(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const completed = parsed.data.completed ?? false;
  const { error } = await srv.from("user_video_progress").upsert(
    {
      user_id: auth.userId,
      video_id: parsed.data.videoId,
      last_position: parsed.data.position,
      completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,video_id" },
  );

  if (error) {
    if (isMissingRelationError(error, "user_video_progress")) {
      return NextResponse.json(
        { success: false, error: "观看进度表未初始化，请先执行数据库迁移。" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
