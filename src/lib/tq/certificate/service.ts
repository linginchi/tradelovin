import type { SupabaseClient } from "@supabase/supabase-js";

import type { MembershipTier } from "@/lib/membership/types";
import { buildTieredNarrative } from "@/lib/tq/certificate/profile-rules";
import { renderSvgToImage, renderTqReportPdf } from "@/lib/tq/certificate/render";
import { buildCertificateSvg } from "@/lib/tq/certificate/template";
import { ensureTqCalculated } from "@/lib/tq/engine";
import { buildTqRadarContract, type TqFeatureSnapshot, type TqScoreSnapshot } from "@/lib/tq/radar-contract";

const BUCKET = "tq-certificates";
const TEMPLATE_VERSION = "tqscore-v2";

type IssueParams = {
	userId: string;
	tier: MembershipTier;
	environment: "sim" | "live";
	period: "all" | "monthly" | "weekly" | "daily";
};

type CertRow = {
	id: number;
	user_id: string;
	environment: "sim" | "live";
	period: "all" | "monthly" | "weekly" | "daily";
	membership_tier: MembershipTier;
	template_version: string;
	report_snapshot: Record<string, unknown>;
	pdf_path: string;
	image_path: string;
	issued_at: string;
};

function nowStamp(): string {
	return new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replaceAll(".", "");
}

async function ensureBucket(srv: SupabaseClient): Promise<void> {
	const { data: buckets } = await srv.storage.listBuckets();
	if ((buckets ?? []).some((bucket) => bucket.name === BUCKET)) return;
	await srv.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "15MB" });
}

async function loadScoreAndFeatures(srv: SupabaseClient, params: IssueParams) {
	await ensureTqCalculated(srv, {
		userId: params.userId,
		environment: params.environment,
		period: params.period,
	});
	const [{ data: scoreRows, error: scoreErr }, { data: featureRows, error: featureErr }] = await Promise.all([
		srv
			.from("tq_scores")
			.select("dimension,score,total_score,calc_time")
			.eq("user_id", params.userId)
			.eq("environment", params.environment)
			.eq("period", params.period),
		srv
			.from("tq_features")
			.select("feature_name,raw_value,norm_score,calc_time")
			.eq("user_id", params.userId)
			.eq("environment", params.environment)
			.eq("period", params.period),
	]);
	if (scoreErr || featureErr) {
		throw new Error(scoreErr?.message ?? featureErr?.message ?? "读取TQ证书数据失败");
	}
	const score: TqScoreSnapshot = {
		userId: params.userId,
		environment: params.environment,
		period: params.period,
		totalScore: 0,
		calcTime: "",
		dimensions: {
			profitability: 0,
			riskControl: 0,
			consistency: 0,
			activeness: 0,
		},
	};
	for (const row of scoreRows ?? []) {
		if (row.dimension === "profitability") score.dimensions.profitability = Number(row.score ?? 0);
		if (row.dimension === "risk_control") score.dimensions.riskControl = Number(row.score ?? 0);
		if (row.dimension === "consistency") score.dimensions.consistency = Number(row.score ?? 0);
		if (row.dimension === "activeness") score.dimensions.activeness = Number(row.score ?? 0);
		score.totalScore = Number(row.total_score ?? score.totalScore);
		score.calcTime = String(row.calc_time ?? score.calcTime);
	}
	const features: TqFeatureSnapshot[] = (featureRows ?? []).map((row) => ({
		featureName: String(row.feature_name),
		rawValue: Number(row.raw_value ?? 0),
		normScore: Number(row.norm_score ?? 0),
		calcTime: String(row.calc_time ?? ""),
	}));
	return { score, features };
}

async function uploadArtifact(
	srv: SupabaseClient,
	path: string,
	contentType: string,
	data: Buffer,
): Promise<void> {
	const { error } = await srv.storage.from(BUCKET).upload(path, data, {
		contentType,
		upsert: true,
	});
	if (error) throw new Error(`上传证书文件失败: ${error.message}`);
}

async function signPath(srv: SupabaseClient, path: string): Promise<string> {
	const { data, error } = await srv.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
	if (error) throw new Error(`签发证书URL失败: ${error.message}`);
	return data.signedUrl;
}

export async function issueTqCertificate(srv: SupabaseClient, params: IssueParams) {
	await ensureBucket(srv);
	const { score, features } = await loadScoreAndFeatures(srv, params);
	const radar = buildTqRadarContract(score, features);
	const narrative = buildTieredNarrative(params.tier, score, features);

	const issuedAt = new Date().toISOString();
	const svg = buildCertificateSvg({
		userId: params.userId,
		tier: params.tier,
		environment: params.environment,
		period: params.period,
		issuedAt,
		totalScore: score.totalScore,
		radar,
		narrative,
		info: {
			username: params.userId,
			market: params.environment === "live" ? "实盘账户" : "模拟账户",
			roiText: `${(Number(features.find((x) => x.featureName === "PnlEfficiency")?.rawValue ?? 0) * 100).toFixed(2)}%`,
			tradeLifeText: `${Number(features.find((x) => x.featureName === "TradeDays")?.rawValue ?? 0).toFixed(0)}天`,
			biggestLossText: `${Number(features.find((x) => x.featureName === "MinNegPnl")?.rawValue ?? 0).toFixed(2)}`,
			avgDurationText: "--",
		},
	});
	const imageBytes = await renderSvgToImage(svg);
	const pdfBytes = await renderTqReportPdf({
		userId: params.userId,
		tier: params.tier,
		environment: params.environment,
		period: params.period,
		issuedAt,
		score,
		narrative,
		radar,
		features,
	});
	const stamp = nowStamp();
	const basePath = `${params.userId}/${params.environment}/${params.period}/${params.tier}/${stamp}`;
	const pdfPath = `${basePath}.pdf`;
	const imagePath = `${basePath}.svg`;
	await Promise.all([
		uploadArtifact(srv, pdfPath, "application/pdf", pdfBytes),
		uploadArtifact(srv, imagePath, "image/svg+xml", imageBytes),
	]);

	const snapshot = {
		score,
		features,
		radar,
		narrative,
	};
	const { data: inserted, error: insertErr } = await srv
		.from("tq_certificates")
		.insert({
			user_id: params.userId,
			environment: params.environment,
			period: params.period,
			membership_tier: params.tier,
			template_version: TEMPLATE_VERSION,
			report_snapshot: snapshot,
			pdf_path: pdfPath,
			image_path: imagePath,
		})
		.select("*")
		.limit(1)
		.maybeSingle();
	if (insertErr || !inserted) {
		throw new Error(insertErr?.message ?? "写入证书记录失败");
	}
	return {
		record: inserted as CertRow,
		pdfUrl: await signPath(srv, pdfPath),
		imageUrl: await signPath(srv, imagePath),
	};
}

export async function getLatestTqCertificate(
	srv: SupabaseClient,
	params: {
		userId: string;
		environment: "sim" | "live";
		period: "all" | "monthly" | "weekly" | "daily";
	},
) {
	const { data, error } = await srv
		.from("tq_certificates")
		.select("*")
		.eq("user_id", params.userId)
		.eq("environment", params.environment)
		.eq("period", params.period)
		.order("issued_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw new Error(`读取证书失败: ${error.message}`);
	if (!data) return null;
	const row = data as CertRow;
	return {
		record: row,
		pdfUrl: await signPath(srv, row.pdf_path),
		imageUrl: await signPath(srv, row.image_path),
	};
}

