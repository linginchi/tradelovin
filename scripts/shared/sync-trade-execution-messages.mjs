#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncGeneratedModule } from "./sync-file-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.resolve(__dirname, "../../src/lib/trade/execution-messages.ts");
const targetPath = path.resolve(__dirname, "./trade-execution-messages.mjs");
const checkOnly = process.argv.includes("--check");

const result = await syncGeneratedModule({
	sourcePath,
	targetPath,
	sourceFileHint: "src/lib/trade/execution-messages.ts",
	matcher: /^export const TRADE_ORDER_MESSAGE_[A-Z_]+\s*=/,
	checkOnly,
	onDriftHint: ({ targetPath: driftTargetPath }) => {
		const fixHint = [
			"Execution messages drift detected.",
			`Target out of sync: ${path.relative(process.cwd(), driftTargetPath)}`,
			"Fix steps:",
			"  1) npm run sync:trade-execution-messages",
			`  2) git add "${path.relative(process.cwd(), driftTargetPath)}"`,
			'  3) commit with message like "sync trade execution messages"',
		].join("\n");
		console.error(fixHint);
		if (process.env.GITHUB_ACTIONS === "true") {
			console.error(
				`::error::Execution messages drift detected. Run 'npm run sync:trade-execution-messages' and commit generated file.`,
			);
		}
	},
});

if (checkOnly) {
	console.log(`Execution messages are in sync (${result.linesCount} entries).`);
	process.exit(0);
}

console.log(`Synced ${result.linesCount} execution messages -> ${result.targetRelative}`);
