import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
	return NextResponse.json({
		success: true,
		data: {
			release: {
				sha: process.env.DEPLOY_GIT_SHA ?? "unknown",
				source: process.env.DEPLOY_SOURCE ?? "unknown",
				time: process.env.DEPLOY_TIME ?? "unknown",
			},
			features: {
				legacyScoreAlias: true,
				tqPeriods: ["all", "monthly", "weekly", "daily"],
				tqCertificates: true,
			},
		},
	});
}

