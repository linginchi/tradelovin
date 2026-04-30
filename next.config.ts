import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * 仅 OpenNext / Workers 生产构建应设置（与最终对外 Worker 或 CDN 同源、无尾部斜杠）。
 * 本地 `next dev` 切勿设置，否则 `/_next/static` 会指到远程，导致本地页面无 CSS。
 */
function resolveAssetPrefix(): string | undefined {
	const raw =
		(typeof process.env.NEXT_ASSET_PREFIX === "string" && process.env.NEXT_ASSET_PREFIX.trim()) ||
		(typeof process.env.ASSET_PREFIX === "string" && process.env.ASSET_PREFIX.trim()) ||
		"";
	if (!raw) return undefined;
	return raw.replace(/\/+$/, "");
}

const assetPrefix = resolveAssetPrefix();

const nextConfig: NextConfig = {
	...(assetPrefix ? { assetPrefix } : {}),

	// 保持构建输出目录标准
	distDir: ".next",
	reactStrictMode: true,

	images: {
		formats: ["image/avif", "image/webp"],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.supabase.co",
				pathname: "/storage/v1/object/public/**",
			},
		],
	},

	// 避免 Turbopack 干扰资源路径解析
	turbopack: {},
};

initOpenNextCloudflareForDev();

export default withNextIntl(nextConfig);
