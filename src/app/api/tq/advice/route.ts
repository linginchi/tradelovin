import { NextResponse } from "next/server";

import { getMembershipSnapshot } from "@/lib/membership/service";
import { ensureCurrentMembership } from "@/lib/membership/v2";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { readTqEnv, readTqPeriod } from "@/lib/tq/request";
import { requireTradeUser } from "@/lib/trade/require-user";

export const runtime = "nodejs";

type AdviceTemplate = {
  key: string;
  title: string;
  condition_json: { feature?: string; op?: string; value?: number };
  advice_template: string;
  course_hint: string | null;
};

function hit(template: AdviceTemplate, featureMap: Record<string, number>): boolean {
  const feature = String(template.condition_json?.feature ?? "");
  const op = String(template.condition_json?.op ?? "");
  const value = Number(template.condition_json?.value ?? Number.NaN);
  const current = Number(featureMap[feature] ?? Number.NaN);
  if (!feature || !op || !Number.isFinite(value) || !Number.isFinite(current)) return false;
  if (op === "lt") return current < value;
  if (op === "lte") return current <= value;
  if (op === "gt") return current > value;
  if (op === "gte") return current >= value;
  return false;
}

export async function GET(request: Request) {
  try {
    const auth = await requireTradeUser();
    if (auth instanceof NextResponse) return auth;
    const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
    const legacy = membership ? null : await getMembershipSnapshot(auth.supabase, auth.userId);
    if (!membership && !legacy) {
      return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
    }
    const blockedByPlan = membership
      ? membership.plan === "T0_paid"
      : legacy
        ? legacy.tier === "T1" && legacy.status !== "trialing"
        : true;
    if (blockedByPlan) {
      return NextResponse.json({ success: false, error: "请升级会员后查看建议" }, { status: 403 });
    }

    const url = new URL(request.url);
    const env = readTqEnv(url.searchParams.get("env"));
    const period = readTqPeriod(url.searchParams.get("period"));

    const srv = getServiceSupabase();
    if (!srv) return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });

    await ensureTqCalculated(srv, { userId: auth.userId, environment: env, period });

    const [{ data: scoreRows }, { data: featureRows }, { data: templates }] = await Promise.all([
      srv
        .from("tq_scores")
        .select("dimension,score,total_score")
        .eq("user_id", auth.userId)
        .eq("environment", env)
        .eq("period", period),
      srv
        .from("tq_features")
        .select("feature_name,raw_value")
        .eq("user_id", auth.userId)
        .eq("environment", env)
        .eq("period", period),
      srv
        .from("tq_advice_templates")
        .select("key,title,condition_json,advice_template,course_hint")
        .eq("enabled", true),
    ]);

    const featureMap: Record<string, number> = {};
    for (const row of featureRows ?? []) {
      featureMap[String(row.feature_name)] = Number(row.raw_value ?? 0);
    }
    const dimensions: Record<string, number> = {};
    let totalScore = 0;
    for (const row of scoreRows ?? []) {
      dimensions[String(row.dimension)] = Number(row.score ?? 0);
      totalScore = Number(row.total_score ?? totalScore);
    }

    const advice = ((templates ?? []) as AdviceTemplate[])
      .filter((template) => hit(template, featureMap))
      .map((template) => ({
        key: template.key,
        title: template.title,
        text: template.advice_template,
        courseHint: template.course_hint,
      }));

    return NextResponse.json({
      success: true,
      data: {
        totalScore,
        dimensions,
        advice,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "加载建议失败",
      },
      { status: 500 },
    );
  }
}
