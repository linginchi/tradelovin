import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.resolve(__dirname);

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
	const normalized = raw.replace(/\/+$/, "");
	// 多入口（海外 tradelovin.com + 内地 xeoaxis.com）下，绝对前缀若指向 *.workers.dev，
	// 会让内地用户的浏览器直连 Cloudflare 加载 /_next/static，被墙/超时后渲染成无样式裸 HTML。
	// 这类前缀一律忽略并回退同源相对路径，避免误配再次打挂内地入口。
	if (/(?:^|\/\/)(?:[^/]+\.)?workers\.dev(?:[:/]|$)/i.test(normalized)) {
		console.warn(
			`[next.config] 已忽略 NEXT_ASSET_PREFIX="${normalized}"：指向 workers.dev 会导致内地入口静态资源加载失败，回退为相对路径。`,
		);
		return undefined;
	}
	return normalized;
}

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
