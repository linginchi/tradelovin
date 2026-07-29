// src/lib/site/resolve-asset-prefix.mjs
export function resolveAssetPrefix(env = process.env) {
	const raw =
		(typeof env.NEXT_ASSET_PREFIX === "string" && env.NEXT_ASSET_PREFIX.trim()) ||
		(typeof env.ASSET_PREFIX === "string" && env.ASSET_PREFIX.trim()) ||
		"";
	if (!raw) return undefined;
	const normalized = raw.replace(/\/+$/, "");
	// 多入口：任何绝对或协议相对前缀都会把内地入口静态资源钉死到外域。
	if (/^(?:https?:)?\/\//i.test(normalized)) {
		console.warn(
			`[resolveAssetPrefix] 已忽略绝对前缀 "${normalized}"：多入口架构下必须使用同源相对路径。`,
		);
		return undefined;
	}
	return normalized;
}
