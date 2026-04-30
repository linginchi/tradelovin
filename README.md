# tradelovin

Next.js 应用（OpenNext for Cloudflare）。本地开发：`npm run dev`；Cloudflare 构建：`npm run build:cloudflare`。

- **只保留 Workers 生产入口、从 Pages 迁自定义域、删除 Pages 前检查项**：见 [DEPLOY.md](DEPLOY.md)。
- **内地测试入口（免备案，香港服务器）**：见 [ops/mainland-access/README.md](ops/mainland-access/README.md)。
- **内地正式入口（需备案，深圳服务器）**：见 [ops/mainland-access/README-shenzhen.md](ops/mainland-access/README-shenzhen.md)。
