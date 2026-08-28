import assert from "node:assert/strict";
import test from "node:test";

import { resolveHomeUpgradeCta } from "@/lib/membership/home-upgrade-cta";

test("guest sees generic upgrade CTA to login", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: false, plan: null }), {
		visible: true,
		href: "/login?next=/membership",
		nextPlan: null,
	});
});

test("authed user without plan sees membership link", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: null }), {
		visible: true,
		href: "/membership",
		nextPlan: null,
	});
});

test("trial user sees next paid plan deep link", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: "T0_trial" }), {
		visible: true,
		href: "/membership?plan=T1",
		nextPlan: "T1",
	});
});

test("T0 paid user sees T1 upgrade", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: "T0_paid" }), {
		visible: true,
		href: "/membership?plan=T1",
		nextPlan: "T1",
	});
});

test("T1 user sees T2 upgrade", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: "T1" }), {
		visible: true,
		href: "/membership?plan=T2",
		nextPlan: "T2",
	});
});

test("T2 user sees T3 upgrade", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: "T2" }), {
		visible: true,
		href: "/membership?plan=T3",
		nextPlan: "T3",
	});
});

test("T3 user hides upgrade CTA", () => {
	assert.deepEqual(resolveHomeUpgradeCta({ isAuthed: true, plan: "T3" }), {
		visible: false,
		href: "/membership",
		nextPlan: null,
	});
});
