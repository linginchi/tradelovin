import { readFile } from "node:fs/promises";
import path from "node:path";

import {
	formatSpikeSummaryForOutput,
	runSpikeLabCheck,
} from "@/lib/lab/spike-check";

async function loadOptionalReport(reportPath: string | undefined): Promise<unknown | undefined> {
	if (!reportPath) return undefined;
	const abs = path.resolve(reportPath);
	const raw = await readFile(abs, "utf8");
	return JSON.parse(raw) as unknown;
}

async function main() {
	const reportArgIndex = process.argv.indexOf("--report");
	const reportPath = reportArgIndex >= 0 ? process.argv[reportArgIndex + 1] : undefined;
	if (reportArgIndex >= 0 && !reportPath) {
		console.error("用法: spike-check [--report path/to/report.json]");
		process.exit(1);
	}

	let reportJson: unknown;
	try {
		reportJson = await loadOptionalReport(reportPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`无法读取报告文件: ${message}`);
		process.exit(1);
	}

	const { exitCode, summary } = await runSpikeLabCheck({ reportJson });
	process.stdout.write(formatSpikeSummaryForOutput(summary));
	process.exit(exitCode);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
