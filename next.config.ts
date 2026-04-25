import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
	distDir: ".next",
	reactStrictMode: true,
	// 不要用硬编码 workers.dev 作 assetPrefix；换自定义域时仍会把静态资源指到旧主机。
	// 若确需绝对前缀（独立 CDN 等），在构建/部署环境设置 ASSET_PREFIX。
	...(process.env.ASSET_PREFIX
		? { assetPrefix: process.env.ASSET_PREFIX }
		: {}),
};

initOpenNextCloudflareForDev();

export default nextConfig;
