import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveProjectAlias(specifier) {
	const base = path.join(projectRoot, "src", specifier.slice(2));
	for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
		if (existsSync(candidate)) return pathToFileURL(candidate).href;
	}
	return null;
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier.startsWith("@/")) {
		const url = resolveProjectAlias(specifier);
		if (!url) throw new Error(`无法解析项目别名：${specifier}`);
		return { url, shortCircuit: true };
	}
	if (specifier.startsWith("next/")) {
		const modulePath = path.join(projectRoot, "node_modules/next", `${specifier.slice(5)}.js`);
		if (!existsSync(modulePath)) return nextResolve(specifier, context);
		return {
			url: pathToFileURL(modulePath).href,
			shortCircuit: true,
		};
	}
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	if (url.endsWith(".ts") || url.endsWith(".tsx")) {
		const source = await readFile(new URL(url), "utf8");
		const output = ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ES2022,
				jsx: ts.JsxEmit.ReactJSX,
			},
			fileName: fileURLToPath(url),
		});
		return { format: "module", source: output.outputText, shortCircuit: true };
	}
	return nextLoad(url, context);
}
