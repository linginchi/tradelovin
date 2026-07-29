import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import createNextIntlPlugin from "next-intl/plugin";
import { resolveAssetPrefix } from "./src/lib/site/resolve-asset-prefix.mjs";

const projectRoot = path.resolve(__dirname);

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const assetPrefix = resolveAssetPrefix();

const nextConfig: NextConfig = {
	...(assetPrefix ? { assetPrefix } : {}),

	async rewrites() {
		return [
			{ source: "/supabase-proxy", destination: "/api/supabase-proxy" },
			{ source: "/supabase-proxy/:path*", destination: "/api/supabase-proxy/:path*" },
		];
	},

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

	// 显式指定项目根，避免 Turbopack 把上层目录当成 workspace（会导致 tailwindcss 等依赖解析失败）
	turbopack: {
		root: projectRoot,
	},
};

initOpenNextCloudflareForDev();

export default withNextIntl(nextConfig);
