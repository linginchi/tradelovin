import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const MIDDLEWARE = "src/middleware.ts";
const LOCALES = ["zh", "zh-TW", "en"];

const read = (path) => readFile(new URL(path, root), "utf8");

function extractProtectedPaths(source) {
	const match = source.match(/const\s+PROTECTED_PATHS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
	assert.ok(match, "PROTECTED_PATHS declaration must exist in middleware.ts");
	return [...match[1].matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);
}

/** Mirrors src/middleware.ts isProtectedPath against an explicit path list. */
function isProtectedPath(pathname, protectedPaths) {
	for (const raw of protectedPaths) {
		const rootPath = raw.replace(/\/$/, "");
		if (pathname === rootPath || pathname.startsWith(`${rootPath}/`)) return true;
		for (const loc of LOCALES) {
			const localPath = `/${loc}${rootPath}`;
			if (pathname === localPath || pathname.startsWith(`${localPath}/`)) return true;
		}
	}
	return false;
}

function wouldRedirectGuestToLogin(pathname, protectedPaths) {
	return isProtectedPath(pathname, protectedPaths);
}

test("guest preview pages must not be auth-gated (courses + video-player, all locales)", async () => {
	const source = await read(MIDDLEWARE);
	const protectedPaths = extractProtectedPaths(source);

	assert.ok(
		!protectedPaths.includes("/courses"),
		"PROTECTED_PATHS must not include /courses so guests can browse free preview",
	);
	assert.ok(
		!protectedPaths.includes("/video-player"),
		"PROTECTED_PATHS must not include /video-player",
	);

	const publicPaths = [
		"/courses",
		"/courses/1f7546e5-0684-4570-953c-686c90800c30",
		"/video-player",
		"/video-player?courseId=1f7546e5-0684-4570-953c-686c90800c30&videoId=eb4462d8-cb32-4f40-a5e6-65dcb26d06e8",
		"/zh/courses",
		"/zh/courses/1f7546e5-0684-4570-953c-686c90800c30",
		"/zh/video-player?courseId=x&videoId=y",
		"/zh-TW/courses",
		"/zh-TW/courses/1f7546e5-0684-4570-953c-686c90800c30",
		"/zh-TW/video-player",
		"/en/courses",
		"/en/courses/1f7546e5-0684-4570-953c-686c90800c30",
		"/en/video-player?foo=1",
	];

	for (const raw of publicPaths) {
		const pathname = raw.split("?")[0];
		assert.equal(
			wouldRedirectGuestToLogin(pathname, protectedPaths),
			false,
			`guest must NOT be redirected for ${raw}`,
		);
	}
});

test("existing protected pages still require login (including locale prefixes)", async () => {
	const source = await read(MIDDLEWARE);
	const protectedPaths = extractProtectedPaths(source);

	for (const required of ["/my-learning", "/membership", "/trade", "/trade-v2", "/lab", "/coach"]) {
		assert.ok(
			protectedPaths.includes(required),
			`PROTECTED_PATHS must still include ${required}`,
		);
	}

	const gatedPaths = [
		"/my-learning",
		"/trade",
		"/lab",
		"/membership",
		"/trade-v2",
		"/zh/my-learning",
		"/zh/trade",
		"/zh/lab",
		"/coach",
		"/zh/coach",
		"/zh-TW/my-learning",
		"/zh-TW/trade",
		"/zh-TW/lab",
		"/en/my-learning",
		"/en/trade",
		"/en/lab",
	];

	for (const pathname of gatedPaths) {
		assert.equal(
			wouldRedirectGuestToLogin(pathname, protectedPaths),
			true,
			`guest must still be redirected for ${pathname}`,
		);
	}
});

test("middleware matches all paths then skips non-page routes before app logic", async () => {
	const source = await read(MIDDLEWARE);
	assert.match(source, /matcher:\s*\[\s*"\/:path\*"\s*\]/);
	assert.match(source, /function shouldSkipMiddlewarePath/);
	assert.match(source, /pathname === "\/api"/);
	assert.match(source, /pathname === "\/_next"/);
	assert.match(source, /pathname === "\/_vercel"/);
	assert.match(source, /pathname === "\/auth"/);
	assert.match(source, /pathname\.includes\("\."\)/);
	assert.match(source, /if \(shouldSkipMiddlewarePath\(pathname\)\)[\s\S]*?return NextResponse\.next\(\);/);
	assert.doesNotMatch(source, /\(\?!api\|_next\|_vercel\|auth/);
});
