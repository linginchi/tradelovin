import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
	// 关键：明确告诉 Next.js 生产环境下所有静态资源的绝对 URL 前缀
	// 使用你的 Worker 实际部署后的域名（不含尾部斜杠）
	assetPrefix: "https://tradelovin.mark-377.workers.dev",

	// 保持构建输出目录标准
	distDir: ".next",
	reactStrictMode: true,

	// 避免 Turbopack 干扰资源路径解析
	turbopack: {},
};

initOpenNextCloudflareForDev();

export default nextConfig;
