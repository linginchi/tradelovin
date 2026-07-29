const RECOVERY_MESSAGE = "See ops/mainland-access/XEOAXIS_RECOVERY.md";
const BLOCKED_REDIRECT_HOSTS = new Set([
	"leolearnstotrade.com",
	"www.leolearnstotrade.com",
	"tradelovin.com",
	"www.tradelovin.com",
]);

function normalizeBaseUrl(value) {
	return (value || "https://xeoaxis.com").replace(/\/+$/, "");
}

function isSameOrigin(left, right) {
	return left.origin === right.origin;
}

function isHttpsUpgrade(from, to) {
	return from.protocol === "http:" && to.protocol === "https:" && from.host === to.host;
}

async function fetchEntry(baseUrl) {
	let url = new URL(`${baseUrl}/`);
	let response = await fetch(url, { redirect: "manual" });

	if (response.status >= 300 && response.status <= 399) {
		const location = response.headers.get("location");
		if (!location) throw new Error(`Entry redirect has no Location header (${response.status})`);
		const target = new URL(location, url);
		if (BLOCKED_REDIRECT_HOSTS.has(target.hostname)) {
			throw new Error(`Entry redirects to blocked host ${target.hostname}`);
		}
		if (!isSameOrigin(url, target) || !isHttpsUpgrade(url, target)) {
			throw new Error(`Entry redirects outside same-origin HTTPS upgrade: ${target.href}`);
		}
		url = target;
		response = await fetch(url, { redirect: "manual" });
	}

	if (response.status !== 200) {
		throw new Error(`Entry returned HTTP ${response.status} at ${url.href}`);
	}

	return { response, url };
}

async function run() {
	const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
	const entry = await fetchEntry(baseUrl);
	const html = await entry.response.text();

	if (html.includes("workers.dev")) {
		throw new Error("Entry HTML contains workers.dev");
	}

	const staticReferences = [...html.matchAll(/(?:https?:\/\/[^"'\s<>()]+)?(\/_next\/static\/[^"'\s<>()]+)/g)].map(
		(match) => match[0],
	);
	for (const reference of staticReferences) {
		if (
			reference.startsWith("https://leolearnstotrade.com") ||
			reference.startsWith("https://www.leolearnstotrade.com") ||
			reference.startsWith("https://tradelovin.com") ||
			reference.startsWith("https://www.tradelovin.com")
		) {
			throw new Error(`Static asset uses blocked origin: ${reference}`);
		}
	}

	const firstStaticPath = html.match(/\/_next\/static\/[^"'\s<>()]+/)?.[0];
	if (!firstStaticPath) throw new Error("Entry HTML contains no /_next/static reference");

	const assetUrl = new URL(firstStaticPath, entry.url);
	if (!isSameOrigin(assetUrl, entry.url)) {
		throw new Error(`Static asset is not same-origin: ${assetUrl.href}`);
	}
	const assetResponse = await fetch(assetUrl, { redirect: "manual" });
	if (assetResponse.status !== 200) {
		throw new Error(`Static asset returned HTTP ${assetResponse.status}: ${assetUrl.href}`);
	}
}

try {
	await run();
	console.log("xeoaxis entry smoke passed");
} catch (error) {
	console.error(`xeoaxis entry smoke failed: ${error instanceof Error ? error.message : String(error)}`);
	console.error(RECOVERY_MESSAGE);
	process.exitCode = 1;
}
