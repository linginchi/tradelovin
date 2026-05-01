import { NextResponse } from "next/server";

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function requireSameOriginForMutation(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  const origin = normalizeOrigin(originHeader) ?? normalizeOrigin(refererHeader);

  if (!origin || origin !== requestOrigin) {
    return NextResponse.json(
      { success: false, error: "CSRF 校验失败" },
      { status: 403 },
    );
  }

  const proto = request.headers.get("x-forwarded-proto");
  if (process.env.NODE_ENV === "production" && proto && proto !== "https") {
    return NextResponse.json(
      { success: false, error: "仅允许 HTTPS 请求" },
      { status: 403 },
    );
  }

  return null;
}
