import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const WORKFLOW = ".github/workflows/opennext-build.yml";

const FAIL_CLOSED_DEFAULTS = [
	"NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS",
	"NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN",
	"ENABLE_DEV_TEST_ACCOUNTS",
	"ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION",
	"ALLOW_FIXED_ADMIN_OTP",
	"ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION",
];

const GATE_CHECKED_TOGGLES = [
	"ALLOW_FIXED_ADMIN_OTP",
	"ALLOW_FIXED_ADMIN_OTP_IN_PRODUCTION",
	"ENABLE_DEV_TEST_ACCOUNTS",
	"ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION",
	"NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS",
	"NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN",
];

function sliceStep(source, stepName) {
	const marker = `- name: ${stepName}`;
	const start = source.indexOf(marker);
	assert.ok(start > -1, `expected workflow step: ${stepName}`);
	const next = source.indexOf("\n      - name:", start + marker.length);
	return next === -1 ? source.slice(start) : source.slice(start, next);
}

test("main deploy path defaults all debug auth toggles to fail-closed 0", async () => {
	const source = await readFile(new URL(WORKFLOW, root), "utf8");

	const buildStep = sliceStep(source, "OpenNext Cloudflare build");
	assert.match(
		buildStep,
		/NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS:\s*\$\{\{\s*vars\.NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS\s*\|\|\s*'0'\s*\}\}/,
	);
	assert.match(
		buildStep,
		/NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN:\s*\$\{\{\s*vars\.NEXT_PUBLIC_SHOW_CJKZT_QUICK_LOGIN\s*\|\|\s*'0'\s*\}\}/,
	);
	assert.doesNotMatch(buildStep, /\|\|\s*'1'\s*\}\}/);

	const gateStep = sliceStep(source, "Production safety gate");
	const deployStep = sliceStep(source, "Deploy to Cloudflare Workers");

	for (const key of FAIL_CLOSED_DEFAULTS) {
		const pattern = new RegExp(`${key}:\\s*\\$\\{\\{\\s*vars\\.${key}\\s*\\|\\|\\s*'0'\\s*\\}\\}`);
		assert.match(gateStep, pattern, `${key} must default to 0 in safety gate`);
		if (key.startsWith("NEXT_PUBLIC_")) continue;
		assert.match(deployStep, pattern, `${key} must default to 0 in deploy step`);
	}

	assert.doesNotMatch(gateStep, /\|\|\s*'1'\s*\}\}/);
	assert.doesNotMatch(deployStep, /\|\|\s*'1'\s*\}\}/);
});

test("production safety gate checks every fixed OTP / quick-login / dev-test toggle", async () => {
	const source = await readFile(new URL(WORKFLOW, root), "utf8");
	const gateStep = sliceStep(source, "Production safety gate");

	assert.match(gateStep, /ALLOW_PROD_DEBUG_AUTH/);
	assert.match(gateStep, /skip strict safety gate/);

	for (const key of GATE_CHECKED_TOGGLES) {
		assert.match(
			gateStep,
			new RegExp(`"\\$\\{${key}\\}"`),
			`safety gate must inspect ${key}`,
		);
	}

	assert.match(gateStep, /\$\{value\}"\s*!=\s*"0"/);
	assert.match(gateStep, /\$\{value\}"\s*!=\s*"false"/);
	assert.match(gateStep, /exit 1/);
});
