#!/usr/bin/env node
/**
 * 防回归：模拟交易页的会话守门逻辑曾因误跳转到 /my-learning 导致「点模拟交易却进学习页」。
 * 仅校验 TradePageClient 单文件；不扫描全仓库，以免误伤报名等合理跳转。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
const tradeClient = path.join(root, "src", "components", "trade", "TradePageClient.tsx");

function mentionsRouterNavigate(line) {
	return /\brouter\.(replace|push)\s*\(/.test(line);
}

function main() {
	let text = "";
	try {
		text = fs.readFileSync(tradeClient, "utf8");
	} catch (e) {
		console.error("check-trade-session-redirect: cannot read TradePageClient.tsx", e);
		process.exit(1);
	}

	const badLine = text.split(/\n/).find((line) => mentionsRouterNavigate(line) && line.includes("my-learning"));
	if (badLine) {
		console.error(
			`Regression guard FAILED: TradePageClient must not router.replace/push to my-learning (${badLine.trim()}).`,
		);
		console.error(
			"Use buildSimTradingDeniedRedirectHref() from src/lib/trade/sim-trading-denied-redirect.ts for sim trading denials.",
		);
		process.exit(1);
	}

	if (!text.includes("buildSimTradingDeniedRedirectHref")) {
		console.error(
			"Regression guard FAILED: TradePageClient should import buildSimTradingDeniedRedirectHref for TRIAL_EXPIRED / MEMBERSHIP_FORBIDDEN handling.",
		);
		process.exit(1);
	}

	console.log("check-trade-session-redirect-regression: OK");
}

main();
