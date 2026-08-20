import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const testDir = dirname(fileURLToPath(import.meta.url));

async function loadTsModule(specifier) {
	const { register } = await import("node:module");
	register(join(testDir, "../lab/ts-loader.mjs"), pathToFileURL(testDir));
	return import(specifier);
}

test("platform student codes use TL + year + 4-digit sequence without colliding with BD", async () => {
	const { formatBdStudentId, formatPlatformStudentId, nextBdSeq, nextPlatformSeq } = await loadTsModule(
		"../../src/lib/admin/student-code.ts",
	);
	assert.equal(formatBdStudentId(1), "BD0001");
	assert.equal(formatPlatformStudentId(2026, 1), "TL260001");
	assert.equal(formatPlatformStudentId(2026, 17), "TL260017");
	assert.equal(nextBdSeq(["BD0007", "TL260099"]), 8);
	assert.equal(nextPlatformSeq(["BD0007", "TL260003", "TL250099"], 2026), 4);
	assert.throws(() => formatPlatformStudentId(2026, 10000));
});

test("seed account emails cover test logins and super-user whitelist", async () => {
	const { isSeedAccountEmail, DEV_TEST_ACCOUNT_EMAIL } = await loadTsModule("../../src/lib/auth/seed-accounts.ts");
	const { SUPER_USER_EMAILS } = await loadTsModule("../../src/lib/auth/super-user.ts");
	assert.equal(isSeedAccountEmail(DEV_TEST_ACCOUNT_EMAIL.kk, SUPER_USER_EMAILS), true);
	assert.equal(isSeedAccountEmail("mark@hkfac.com", SUPER_USER_EMAILS), true);
	assert.equal(isSeedAccountEmail("student@example.com", SUPER_USER_EMAILS), false);
});

test("admin membership list enriches roster with student code, email, level and flags", () => {
	const list = readFileSync(join(root, "src/app/api/admin/membership/list/route.ts"), "utf8");
	assert.match(list, /loadAdminUserDirectory/);
	assert.match(list, /student_id/);
	assert.match(list, /is_seed/);
	assert.match(list, /is_admin/);
	assert.match(list, /level_label/);
	const panel = readFileSync(join(root, "src/components/admin/AdminGrowthPanel.tsx"), "utf8");
	assert.match(panel, /为无学号会员补发/);
	assert.match(panel, /TL \+ 年份后两位/);
	const assign = readFileSync(join(root, "src/app/api/admin/membership/student-codes/route.ts"), "utf8");
	assert.match(assign, /assignMissingPlatformStudentIds/);
});
