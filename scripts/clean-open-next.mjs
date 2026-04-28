/**
 * Windows 上 OpenNext 构建前删除 .open-next 时常见 EPERM（目录被占用）。
 * 使用带重试的 rmSync；仍失败则提示关闭占用进程或使用 WSL。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".open-next");

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	if (!fs.existsSync(target)) {
		console.log("[clean-open-next] .open-next 不存在，跳过");
		return;
	}

	const maxAttempts = 15;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			fs.rmSync(target, {
				recursive: true,
				force: true,
				maxRetries: 8,
				retryDelay: 250,
			});
			console.log("[clean-open-next] 已删除 .open-next");
			return;
		} catch (err) {
			const code = err && typeof err === "object" && "code" in err ? err.code : "";
			if (attempt < maxAttempts && (code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY")) {
				const wait = Math.min(250 * attempt, 2500);
				console.warn(`[clean-open-next] 第 ${attempt} 次删除失败 (${code})，${wait}ms 后重试…`);
				await sleep(wait);
				continue;
			}

			// Windows：整目录 rm 失败时，先重命名为时间戳目录再异步删，常能解除占用
			if (process.platform === "win32" && (code === "EPERM" || code === "EBUSY")) {
				const stale = path.join(root, `.open-next.stale-${Date.now()}`);
				try {
					fs.renameSync(target, stale);
					console.warn("[clean-open-next] 已将 .open-next 重命名为", path.basename(stale), "（可稍后手动删除该文件夹）");
					return;
				} catch (renameErr) {
					console.warn("[clean-open-next] 重命名回退失败:", renameErr && renameErr.message ? renameErr.message : renameErr);
				}
			}

			console.error("[clean-open-next] 无法删除 .open-next:", err && err.message ? err.message : err);
			console.error(`
请尝试：
  1. 关闭本目录下正在运行的 next dev / wrangler / 终端任务
  2. 在资源管理器中关闭已打开的 .open-next 文件夹
  3. 暂时排除杀毒软件对项目目录的实时扫描
  4. PowerShell（关闭占用后）：Remove-Item -Recurse -Force .open-next
  5. 在 WSL/Linux 中执行：rm -rf .open-next && npm run build:cloudflare
`);
			process.exit(1);
		}
	}
}

await main();
