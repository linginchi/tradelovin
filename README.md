# tradelovin

Next.js 应用（OpenNext for Cloudflare）。本地开发：`npm run dev`；Cloudflare 构建：`npm run build:cloudflare`。

- **只保留 Workers 生产入口、从 Pages 迁自定义域、删除 Pages 前检查项**：见 [DEPLOY.md](DEPLOY.md)。
- **内地测试入口（免备案，香港服务器）**：见 [ops/mainland-access/README.md](ops/mainland-access/README.md)。
- **内地正式入口（需备案，深圳服务器）**：见 [ops/mainland-access/README-shenzhen.md](ops/mainland-access/README-shenzhen.md)。

## 交易执行文案单源校验（trade execution messages）

交易执行相关文案以 `src/lib/trade/execution-messages.ts` 为单一来源，脚本侧文件由同步脚本生成：

- 生成：`npm run sync:trade-execution-messages`
- 校验（不改写）：`npm run verify:trade-execution-messages`

该校验已前置到：

- `npm run smoke:trade-v2`
- `npm run verify:trade-v2-consistency`

若校验失败，先执行同步命令并提交生成文件变更后再继续 smoke / consistency。

## 生成文件聚合命令（generated files）

为后续扩展更多“单源生成文件”，提供统一入口：

- 同步全部生成文件：`npm run sync:generated`
- 校验全部生成文件：`npm run verify:generated`

当前该聚合入口先覆盖交易执行文案；后续新增生成目标时只需把对应脚本接入这两个命令即可。

### 同步脚本复用模板

复用通用工具：`scripts/shared/sync-file-utils.mjs`。

最小接入示例（伪代码）：

```js
import { syncGeneratedModule } from "./sync-file-utils.mjs";

await syncGeneratedModule({
  sourcePath: "<source-file>",
  targetPath: "<generated-file>",
  sourceFileHint: "<source-file-relative-path>",
  matcher: /^export const FOO_/,
  checkOnly: process.argv.includes("--check"),
  onDriftHint: ({ targetPath }) => {
    console.error(`Drift: ${targetPath}`);
  },
});
```
