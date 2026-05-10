import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function collectMatchingLines(sourceText, matcher) {
	return sourceText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => matcher.test(line));
}

export function buildGeneratedModule(sourceFileHint, lines) {
	return [
		"// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.",
		`// Source: ${sourceFileHint}`,
		...lines,
		"",
	].join("\n");
}

export async function syncGeneratedModule({
	sourcePath,
	targetPath,
	sourceFileHint,
	matcher,
	checkOnly,
	onDriftHint,
}) {
	const sourceText = await readFile(sourcePath, "utf8");
	const lines = collectMatchingLines(sourceText, matcher);
	if (lines.length === 0) {
		throw new Error(`No matched lines found in ${sourcePath}`);
	}

	const generated = buildGeneratedModule(sourceFileHint, lines);
	const current = await readFile(targetPath, "utf8").catch(() => "");
	const normalizedCurrent = current.replace(/\r\n/g, "\n");
	const isUpToDate = normalizedCurrent === generated;

	if (checkOnly) {
		if (!isUpToDate) {
			if (typeof onDriftHint === "function") {
				onDriftHint({ sourcePath, targetPath });
			}
			process.exit(1);
		}
		return { linesCount: lines.length, targetRelative: path.relative(process.cwd(), targetPath), isUpToDate };
	}

	await writeFile(targetPath, generated, "utf8");
	return { linesCount: lines.length, targetRelative: path.relative(process.cwd(), targetPath), isUpToDate };
}
