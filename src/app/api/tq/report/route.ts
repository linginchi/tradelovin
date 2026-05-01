import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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

function hitTemplate(
  template: AdviceTemplate,
  featureMap: Record<string, number>,
): boolean {
  const feature = String(template.condition_json?.feature ?? "");
  const op = String(template.condition_json?.op ?? "");
  const threshold = Number(template.condition_json?.value ?? Number.NaN);
  if (!feature || !op || !Number.isFinite(threshold)) return false;
  const current = Number(featureMap[feature] ?? Number.NaN);
  if (!Number.isFinite(current)) return false;
  if (op === "lt") return current < threshold;
  if (op === "lte") return current <= threshold;
  if (op === "gt") return current > threshold;
  if (op === "gte") return current >= threshold;
  return false;
}

async function buildPdf(params: {
  userId: string;
  env: string;
  period: string;
  totalScore: number;
  dimensions: Record<string, number>;
  featureMap: Record<string, number>;
  advice: Array<{ title: string; text: string; courseHint: string | null }>;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  page.drawText("TradeQuotient Deep Report", { x: 48, y, size: 20, font: fontBold, color: rgb(0, 0, 0) });
  y -= 26;
  page.drawText(`User: ${params.userId}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Environment: ${params.env} | Period: ${params.period}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Total Score: ${params.totalScore.toFixed(2)}`, { x: 48, y, size: 12, font: fontBold });

  y -= 28;
  page.drawText("Dimension Scores", { x: 48, y, size: 13, font: fontBold });
  y -= 18;
  for (const [dimension, score] of Object.entries(params.dimensions)) {
    page.drawText(`- ${dimension}: ${Number(score).toFixed(2)}`, { x: 60, y, size: 11, font });
    y -= 14;
  }

  y -= 10;
  page.drawText("Key Features", { x: 48, y, size: 13, font: fontBold });
  y -= 18;
  const keyFeatures = ["WinRatio", "MaxDrawDown", "TradeCount", "ActiveRatio", "AllTimePnl"];
  for (const featureName of keyFeatures) {
    const value = Number(params.featureMap[featureName] ?? 0);
    page.drawText(`- ${featureName}: ${value.toFixed(4)}`, { x: 60, y, size: 11, font });
    y -= 14;
  }

  y -= 10;
  page.drawText("Improvement Advice", { x: 48, y, size: 13, font: fontBold });
  y -= 18;
  if (params.advice.length === 0) {
    page.drawText("- Your metrics are currently stable. Keep discipline and continue journaling.", {
      x: 60,
      y,
      size: 11,
      font,
    });
    y -= 14;
  } else {
    for (const item of params.advice.slice(0, 6)) {
      page.drawText(`- ${item.title}: ${item.text}`, { x: 60, y, size: 10, font });
      y -= 13;
      if (item.courseHint) {
        page.drawText(`  Course: ${item.courseHint}`, { x: 72, y, size: 10, font });
        y -= 13;
      }
      if (y < 80) break;
    }
  }

  return pdf.save();
}

export async function GET(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;
  const membership = await ensureCurrentMembership(auth.supabase, auth.userId);
  const legacy = membership ? null : await getMembershipSnapshot(auth.supabase, auth.userId);
  if (!membership && !legacy) {
    return NextResponse.json({ success: false, error: "会员信息不存在" }, { status: 404 });
  }
  const allowed = membership
    ? membership.plan === "T2" || membership.plan === "T3"
    : legacy
      ? legacy.tier === "T2" || legacy.tier === "T3"
      : false;
  if (!allowed) {
    return NextResponse.json({ success: false, error: "仅 T2/T3 可下载深度报告" }, { status: 403 });
  }

  const url = new URL(request.url);
  const env = readTqEnv(url.searchParams.get("env"));
  const period = readTqPeriod(url.searchParams.get("period"));
  const format = url.searchParams.get("format") ?? "json";

  const srv = getServiceSupabase();
  if (!srv) {
    return NextResponse.json({ success: false, error: "服务不可用" }, { status: 503 });
  }

  await ensureTqCalculated(srv, {
    userId: auth.userId,
    environment: env,
    period,
  });

  const [{ data: scoreRows }, { data: featureRows }, { data: templateRows }] = await Promise.all([
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

  const dimensions: Record<string, number> = {
    profitability: 0,
    risk_control: 0,
    consistency: 0,
    activeness: 0,
  };
  let totalScore = 0;
  for (const row of scoreRows ?? []) {
    dimensions[String(row.dimension)] = Number(row.score ?? 0);
    totalScore = Number(row.total_score ?? totalScore);
  }

  const featureMap: Record<string, number> = {};
  for (const row of featureRows ?? []) {
    featureMap[String(row.feature_name)] = Number(row.raw_value ?? 0);
  }

  const advice = ((templateRows ?? []) as AdviceTemplate[])
    .filter((template) => hitTemplate(template, featureMap))
    .map((template) => ({
      title: template.title,
      text: template.advice_template,
      courseHint: template.course_hint,
    }));

  const payload = {
    userId: auth.userId,
    environment: env,
    period,
    totalScore,
    dimensions,
    features: featureMap,
    advice,
  };

  if (format !== "pdf") {
    return NextResponse.json({ success: true, data: payload });
  }

  const pdfBytes = await buildPdf({
    userId: auth.userId,
    env,
    period,
    totalScore,
    dimensions,
    featureMap,
    advice,
  });
  const pdfBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tq-report-${auth.userId.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
