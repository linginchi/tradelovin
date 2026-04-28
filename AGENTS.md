<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cloudflare / OpenNext 部署

对本仓库执行 **Workers 部署**（`npm run deploy:cloudflare` 等）时，**必须**先阅读并遵守 [`DEPLOY.md`](DEPLOY.md) **§2「Agent / 本地部署：必做检查清单（含 Windows）」**：在 **Windows** 上部署前须排查并结束占用 **`.open-next`** 的进程（例如 **`next dev`**），禁止在出现 `EBUSY` / `EPERM` 时仅向用户甩手而不做占用诊断。
