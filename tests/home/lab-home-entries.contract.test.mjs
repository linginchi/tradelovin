import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("homepage hero exposes four Lab WIP entrances including /lab", async () => {
	const page = await read("src/components/home/HomePageClient.tsx");
	assert.match(page, /href:\s*"\/courses"/);
	assert.match(page, /href:\s*"\/trade"/);
	assert.match(page, /href:\s*"\/lab"/);
	assert.match(page, /href:\s*"\/my-learning"/);
	assert.match(page, /FlaskConical/);
	assert.equal((page.match(/href:\s*"\//g) || []).length >= 4, true);
	assert.doesNotMatch(page, /href:\s*"\/trade"[^]*primary:\s*true/);
});

test("homepage preloads optimized hero webp", async () => {
	const page = await read("src/app/[locale]/page.tsx");
	const hero = await read("src/components/home/HomeHeroBackground.tsx");
	const assets = await read("src/lib/site/home-hero-assets.ts");
	assert.match(page, /preload\(HOME_HERO_WEBP_URL/);
	assert.match(hero, /HOME_HERO_WEBP_URL/);
	assert.match(hero, /HOME_HERO_LQIP_URL/);
	assert.match(assets, /home_hero_v1\.png/);
});

test("messages keep intake popularity keys and Lab four-entry copy", async () => {
	for (const lang of ["zh", "en", "zh-TW"]) {
		const json = JSON.parse(await read(`messages/${lang}.json`));
		assert.ok(json.Home?.entries?.lab, `${lang} Home.entries.lab`);
		assert.ok(json.Home?.entries?.trade, `${lang} Home.entries.trade`);
		assert.ok(json.Nav?.lab, `${lang} Nav.lab`);
		assert.ok(json.Lab?.labNotConfigured, `${lang} Lab.labNotConfigured`);
		const blob = JSON.stringify(json);
		assert.match(blob, /popularity/, `${lang} must retain popularity keys`);
	}
	const zh = JSON.parse(await read("messages/zh.json"));
	assert.equal(zh.Home.entries.trade, "TO交易训练");
	assert.equal(zh.Home.entries.lab, "AI量化实验室");
});

test("honor board section exposes membership upgrade CTA", async () => {
	const page = await read("src/components/home/HomePageClient.tsx");
	assert.match(page, /HomeUpgradeCta/);
	assert.match(page, /honorTitle/);
	const cta = await read("src/components/home/HomeUpgradeCta.tsx");
	assert.match(cta, /resolveHomeUpgradeCta/);
	assert.match(cta, /upgradeCtaTo/);
	for (const lang of ["zh", "en", "zh-TW"]) {
		const json = JSON.parse(await read(`messages/${lang}.json`));
		assert.ok(json.Home?.upgradeCta, `${lang} Home.upgradeCta`);
		assert.ok(json.Home?.upgradeCtaTo, `${lang} Home.upgradeCtaTo`);
		assert.match(json.Home.upgradeCtaTo, /\{level\}/, `${lang} Home.upgradeCtaTo interpolates level`);
	}
});

test("guest free-preview routes stay unprotected; /lab stays protected", async () => {
	const middleware = await read("src/middleware.ts");
	const match = middleware.match(/PROTECTED_PATHS\s*=\s*\[([^\]]+)\]/s);
	assert.ok(match, "PROTECTED_PATHS present");
	const listed = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
	assert.ok(!listed.includes("/courses"), "/courses must remain guest-accessible");
	assert.ok(listed.includes("/lab"), "/lab must remain auth-gated");
	assert.ok(listed.includes("/my-learning"));
});

test("top bar and footer expose /lab product links", async () => {
	const top = await read("src/components/shared/SiteTopBar.tsx");
	const footer = await read("src/components/shared/SiteFooter.tsx");
	assert.match(top, /href="\/lab"/);
	assert.match(top, /href="\/trade"/);
	assert.match(footer, /entries\.lab/);
	assert.match(footer, /href:\s*"\/lab"/);
});
