import { NextResponse } from "next/server";
import { z } from "zod";

import { isSuperUserById } from "@/lib/auth/super-user";
import { consumePointsForVideo, VIDEO_POINTS_COST } from "@/lib/points/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireTradeUser } from "@/lib/trade/require-user";
import { createSignedVideoUrl, isVideoStorageConfigured } from "@/lib/video/storage";
import { isMissingRelationError } from "@/lib/video/db";
import { getQuotaSeconds } from "@/lib/membership/video-quota";

export const runtime = "nodejs";

const TRIAL_DURATION = 10;

/** 获取播放 URL：优先 R2/S3，回退到 Supabase Storage */
async function getVideoPlayUrl(
  storageKey: string,
  ttlSec = 15 * 60,
): Promise<string | null> {
  // 优先用 Supabase Storage（LEO-004 管線直接把成品上傳到這裡）
  const srv = getServiceSupabase();
  if (srv) {
    const { data } = await srv.storage
      .from("Videos")
      .createSignedUrl(storageKey, ttlSec);
    if (data?.signedUrl) return data.signedUrl;
  }

  // 回退到 R2/S3（前端直接上傳 admin 視頻的場景）
  return await createSignedVideoUrl(storageKey, ttlSec);
}

type RouteContext = {
  params: Promise<{ courseId: string; videoId: string }>;
};

async function hasCourseAccess(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data } = await srv
    .from("course_registrations")
    .select("id,status")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .in("status", ["approved", "paid"])
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** 查詢 video → course → topic → content_kind */
async function getContentKind(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  courseId: string,
): Promise<string | null> {
  try {
    const { data } = await srv
      .from("courses")
      .select("topic:course_topics(content_kind)")
      .eq("id", courseId)
      .maybeSingle();
    // data?.topic could be null or an array with one element (FK join)
    const topic = Array.isArray(data?.topic) ? data.topic[0] : data?.topic;
    return topic?.content_kind ?? null;
  } catch {
    return null;
  }
}

/** 檢查入門檔 (T0_paid 已棄用 / T1 雪豹) 月度配額：超標回傳 402，未超標回傳 null */
async function checkMembershipQuota(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  plan: string,
  videoDurationSeconds: number,
): Promise<NextResponse | null> {
  const quotaSec = getQuotaSeconds(plan);
  if (quotaSec === Infinity) return null;

  // 查本月已消耗
  const monthKey = new Date().toISOString().slice(0, 7);
  const { data: usage } = await srv
    .from("monthly_video_usage")
    .select("consumed_seconds")
    .eq("user_id", userId)
    .eq("month_key", monthKey)
    .maybeSingle();

  const consumed = Number(usage?.consumed_seconds ?? 0);
  const quotaMinutes = Math.floor(quotaSec / 60);

  if (consumed + videoDurationSeconds > quotaSec) {
    const remainingSec = Math.max(0, quotaSec - consumed);
    const remainingMin = Math.floor(remainingSec / 60);
    return NextResponse.json(
      {
        error: "本月观看时间已用完",
        quotaExhausted: true,
        plan,
        quotaMinutes,
        consumedSeconds: consumed,
        remainingSeconds: remainingSec > 0 ? remainingSec : 0,
        remainingMinutes: remainingMin,
        upgradePrompt: "升级云豹或金钱豹会员即可无限观看",
      },
      { status: 402 },
    );
  }

  return null;
}

/** 記錄觀看消耗到 monthly_video_usage */
async function recordVideoUsage(
  srv: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  videoDurationSeconds: number,
) {
  const monthKey = new Date().toISOString().slice(0, 7);
  try {
    await srv.rpc("upsert_monthly_video_usage", {
      p_user_id: userId,
      p_month_key: monthKey,
      p_seconds: videoDurationSeconds,
    });
  } catch (err) {
    console.error("记录观看用量失败:", err);
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { courseId, videoId } = await params;
  if (!z.string().uuid().safeParse(courseId).success || !z.string().uuid().safeParse(videoId).success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  if (!isVideoStorageConfigured()) {
    // R2/S3 未配置 → 检查是否有 Supabase Storage 可用
    const srv2 = getServiceSupabase();
    if (!srv2) {
      return NextResponse.json({ error: "视频服务暂未配置" }, { status: 503 });
    }
    // 继续走 Supabase Storage 兜底
  }

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ error: "服务不可用" }, { status: 503 });
  }

  const { data: video, error: videoErr } = await srv
    .from("course_videos")
    .select("id, course_id, storage_key, is_free_preview, view_count, duration")
    .eq("id", videoId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (videoErr) {
    if (isMissingRelationError(videoErr, "course_videos")) {
      return NextResponse.json(
        { error: "视频功能尚未初始化，请先执行数据库迁移（course_videos）。" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: videoErr.message }, { status: 500 });
  }
  if (!video) {
    return NextResponse.json({ error: "视频不存在" }, { status: 404 });
  }

  // 每次播放请求累积观看人次（含游客，每次点击都计数）
  let viewCount = video.view_count ?? 0;
  try {
    const { data: updatedVideo } = await srv
      .from("course_videos")
      .update({ view_count: viewCount + 1 })
      .eq("id", videoId)
      .select("view_count")
      .single();
    viewCount = updatedVideo?.view_count ?? viewCount + 1;
  } catch {
    // view_count 列可能尚未建立，忽略计数
  }

  // 查询课程合作伙伴二维码（列可能暂未建立，做容错）
  let partnerQrUrl: string | null = null;
  let partnerQrLabel = "合作夥伴";
  try {
    const { data: courseData } = await srv
      .from("courses")
      .select("partner_qr_url, partner_qr_label")
      .eq("id", courseId)
      .maybeSingle();
    partnerQrUrl = courseData?.partner_qr_url ?? null;
    partnerQrLabel = courseData?.partner_qr_label ?? "合作夥伴";
  } catch {
    // partner_qr_url / partner_qr_label 列可能尚未建立，忽略
  }

  // 提前查询 content_kind，所有路径共用
  const contentKind = await getContentKind(srv, courseId);

  // 免费预览视频直接返回完整播放
  if (video.is_free_preview) {
    const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
    if (!playUrl) {
      return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
    }
    return NextResponse.json({
      playUrl,
      expiresIn: 15 * 60,
      viewCount,
      partnerQrUrl,
      partnerQrLabel,
      contentKind,
    });
  }

  // 未登录 → 15 秒试看
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) {
    const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
    if (!playUrl) {
      return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
    }
    return NextResponse.json({
      playUrl,
      expiresIn: 15 * 60,
      trial: true,
      trialDuration: TRIAL_DURATION,
      viewCount,
      partnerQrUrl,
      partnerQrLabel,
      contentKind,
    });
  }

  // 已登录 → 根据 content_kind 分支
  const isSuper = await isSuperUserById(srv, auth.userId);

  // === ai_classic（交易新銳 + 交易經典）：會員配額制 ===
  if (contentKind === "ai_classic") {
    // 超级用户跳过所有限制
    if (isSuper) {
      const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
      if (!playUrl) {
        return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
      }
      return NextResponse.json({
        playUrl,
        expiresIn: 15 * 60,
        hasCourseAccess: true,
        viewCount,
        partnerQrUrl,
        partnerQrLabel,
        contentKind: "ai_classic",
      });
    }

    // 查询当前会员等级
    const { data: membership } = await srv
      .from("user_memberships")
      .select("plan")
      .eq("user_id", auth.userId)
      .maybeSingle();
    const plan = membership?.plan ?? "T0_trial";

    // T0_trial（試用）→ 僅返回 10 秒試看，附解鎖提示
    if (plan === "T0_trial") {
      const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
      if (!playUrl) {
        return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
      }
      return NextResponse.json({
        playUrl,
        expiresIn: 15 * 60,
        trial: true,
        trialDuration: TRIAL_DURATION,
        unlockHint: "免费试看10秒，订阅会员解锁完整视频",
        viewCount,
        partnerQrUrl,
        partnerQrLabel,
        contentKind: "ai_classic",
      });
    }

    // T2 / T3（高階）→ 全庫無限，跳過配額
    if (plan === "T2" || plan === "T3") {
      const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
      if (!playUrl) {
        return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
      }
      return NextResponse.json({
        playUrl,
        expiresIn: 15 * 60,
        hasCourseAccess: true,
        viewCount,
        partnerQrUrl,
        partnerQrLabel,
        contentKind: "ai_classic",
        quotaRemaining: null, // 無限制
      });
    }

    // T0_paid（已棄用）/ T1（雪豹入門）→ 配額制
    const videoDurationSec = Math.max(1, Number(video.duration ?? 0));
    const quotaCheck = await checkMembershipQuota(srv, auth.userId, plan, videoDurationSec);
    if (quotaCheck) return quotaCheck; // 402 配额不足

    // 通过 — 记录用量
    await recordVideoUsage(srv, auth.userId, videoDurationSec);

    const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
    if (!playUrl) {
      return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
    }

    // 查询最新配额资讯回传前端
    let quotaRemaining: number | null = null;
    try {
      const currentQuota = getQuotaSeconds(plan);
      const monthKey2 = new Date().toISOString().slice(0, 7);
      const { data: usageData } = await srv
        .from("monthly_video_usage")
        .select("consumed_seconds")
        .eq("user_id", auth.userId)
        .eq("month_key", monthKey2)
        .maybeSingle();
      if (currentQuota !== Infinity) {
        quotaRemaining = Math.floor(Math.max(0, currentQuota - (usageData?.consumed_seconds ?? 0)) / 60);
      }
    } catch { /* 配額查詢失敗不影響播放 */ }

    return NextResponse.json({
      playUrl,
      expiresIn: 15 * 60,
      viewCount,
      partnerQrUrl,
      partnerQrLabel,
      contentKind: "ai_classic",
      quotaRemaining,
    });
  }

  // === KOL: 现有逻辑（课程权限 → 积分） ===

  // 检查课程权限
  if (isSuper || (await hasCourseAccess(srv, auth.userId, courseId))) {
    const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
    if (!playUrl) {
      return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
    }
    return NextResponse.json({
      playUrl,
      expiresIn: 15 * 60,
      hasCourseAccess: true,
      viewCount,
      partnerQrUrl,
      partnerQrLabel,
      contentKind,
    });
  }

  // 无课程权限 → 积分验证
  try {
    const result = await consumePointsForVideo(srv, {
      userId: auth.userId,
      videoId,
      amount: VIDEO_POINTS_COST,
    });
    const playUrl = await getVideoPlayUrl(String(video.storage_key), 15 * 60);
    if (!playUrl) {
      return NextResponse.json({ error: "播放地址生成失败" }, { status: 500 });
    }
    return NextResponse.json({
      playUrl,
      expiresIn: 15 * 60,
      pointsConsumed: VIDEO_POINTS_COST,
      balance: result.balance,
      viewCount,
      partnerQrUrl,
      partnerQrLabel,
      contentKind,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "积分验证失败";
    if (message === "积分不足") {
      // 获取当前积分余额
      const { data: pointsRow } = await srv
        .from("user_points")
        .select("balance")
        .eq("user_id", auth.userId)
        .maybeSingle();
      return NextResponse.json(
        {
          error: "积分不足",
          requiresPoints: VIDEO_POINTS_COST,
          balance: Number(pointsRow?.balance ?? 0),
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
