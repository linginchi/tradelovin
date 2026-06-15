import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTradeUser } from "@/lib/trade/require-user";
import { kolRecruitEmail } from "@/lib/marketing/templates/kol-recruit-email";
import { kolRecruitXiaohongshu } from "@/lib/marketing/templates/kol-recruit-xiaohongshu";
import { studentConvertEmail } from "@/lib/marketing/templates/student-convert-email";
import { studentConvertXiaohongshu } from "@/lib/marketing/templates/student-convert-xiaohongshu";

export const runtime = "nodejs";

const TEMPLATES = {
  kol_recruit_email: kolRecruitEmail,
  kol_recruit_xiaohongshu: kolRecruitXiaohongshu,
  student_convert_email: studentConvertEmail,
  student_convert_xiaohongshu: studentConvertXiaohongshu,
} as const;

const bodySchema = z.object({
  template: z.enum([
    "kol_recruit_email",
    "kol_recruit_xiaohongshu",
    "student_convert_email",
    "student_convert_xiaohongshu",
  ]),
  variables: z.record(z.string(), z.string().or(z.number())),
});

export async function POST(request: Request) {
  const auth = await requireTradeUser();
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求体格式错误" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }

  const renderFn = TEMPLATES[parsed.data.template];
  const copy = renderFn(
    parsed.data.variables as Record<string, string | number>,
  );

  return NextResponse.json({
    success: true,
    data: { copy, characterCount: copy.length },
  });
}
