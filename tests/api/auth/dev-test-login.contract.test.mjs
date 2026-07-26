import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isDevTestLoginEnabled } from "../../../src/lib/auth/dev-test-login-enabled.mjs";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const ROUTE = "src/app/api/auth/dev-test-login/route.ts";

test("production with all flags missing is disabled", () => {
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
		}),
		false,
	);
});

test("production with only one runtime flag enabled is disabled", () => {
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "1",
		}),
		false,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "1",
		}),
		false,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "1",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "0",
		}),
		false,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "0",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "1",
		}),
		false,
	);
});

test("production with both runtime flags true is enabled", () => {
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "1",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "1",
		}),
		true,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "true",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "true",
		}),
		true,
	);
});

test("production does not enable from public build-time flag alone", () => {
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS: "1",
		}),
		false,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS: "1",
			ENABLE_DEV_TEST_ACCOUNTS: "1",
		}),
		false,
	);
});

test("production rejects invalid flag formats as disabled", () => {
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "yes",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "1",
		}),
		false,
	);
	assert.equal(
		isDevTestLoginEnabled({
			NODE_ENV: "production",
			ENABLE_DEV_TEST_ACCOUNTS: "1",
			ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION: "on",
		}),
		false,
	);
});

test("route uses shared fail-closed helper and returns 404 when disabled", async () => {
	const source = await read(ROUTE);
	assert.match(source, /from "@\/lib\/auth\/dev-test-login-enabled\.mjs"/);
	assert.match(source, /if \(!isDevTestLoginEnabled\(\)\)/);
	assert.match(source, /code: "DEV_TEST_LOGIN_DISABLED"/);
	assert.match(source, /status: 404/);
	assert.doesNotMatch(source, /默认启用/);
});
