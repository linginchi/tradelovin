import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

initOpenNextCloudflareForDev();

export default (phase: string) => {
	const isDev = phase === PHASE_DEVELOPMENT_SERVER;
	const assetPrefix = isDev ? undefined : process.env.ASSET_PREFIX;

	const nextConfig: NextConfig = {
		assetPrefix,

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

	return withNextIntl(nextConfig);
};
