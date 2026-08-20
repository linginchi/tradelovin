"use client";

import { useEffect, useMemo, useState } from "react";
import {
	getDisplayLevel,
	getLocalizedLevelDescription,
	getLocalizedLevelLabel,
	getLocalizedLevelName,
} from "@/lib/membership/level-mapping";

export type MembershipPlan = "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";

export type MembershipUpgradePreview = {
	nextPlan: "T1" | "T2" | "T3" | null;
	monthlyScore: number;
	monthlyTradeCount: number;
	minTradesForScore: number;
	planRequirements?: Record<string, { requiredScore: number }>;
};

export type MembershipCurrent = {
	id?: string;
	userId?: string;
	plan: MembershipPlan;
	status?: string;
	trialEnd?: string | null;
	trialDaysLeft?: number;
	upgradePreview?: MembershipUpgradePreview | null;
};

type MembershipCurrentResponse = {
	success?: boolean;
	data?: MembershipCurrent;
};

export function isMembershipExpired(membership: MembershipCurrent | null | undefined): boolean {
	if (!membership) return false;
	if (membership.status === "expired") return true;
	if (membership.plan === "T0_trial") {
		const trialEndMs = membership.trialEnd ? new Date(membership.trialEnd).getTime() : Number.NaN;
		return Number.isFinite(trialEndMs) && trialEndMs <= Date.now();
	}
	return false;
}

export function useMembershipCurrent(enabled = true) {
	const [membership, setMembership] = useState<MembershipCurrent | null>(null);

	useEffect(() => {
		if (!enabled) return;

		let cancelled = false;
		const load = async () => {
			try {
				const res = await fetch("/api/membership/current", {
					credentials: "include",
					cache: "no-store",
				});
				const json = (await res.json()) as MembershipCurrentResponse;
				if (cancelled) return;
				if (res.ok && json.success && json.data) {
					setMembership(json.data);
					return;
				}
				setMembership(null);
			} catch {
				if (!cancelled) setMembership(null);
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [enabled]);

	const effectiveMembership = useMemo(
		() => (enabled ? membership : null),
		[enabled, membership],
	);
	const expired = useMemo(
		() => isMembershipExpired(effectiveMembership),
		[effectiveMembership],
	);
	return { membership: effectiveMembership, expired };
}

export function useMembershipLevel(locale: string, enabled = true) {
	const { membership, expired } = useMembershipCurrent(enabled);

	const level = useMemo(() => {
		const plan = membership?.plan ?? "T0_trial";
		return getDisplayLevel(plan);
	}, [membership?.plan]);

	const levelDisplay = useMemo(
		() => ({
			code: level.code,
			plan: level.plan,
			name: getLocalizedLevelName(level, locale),
			description: getLocalizedLevelDescription(level, locale),
			label: getLocalizedLevelLabel(level, locale),
			shortLabel: `${level.code} ${getLocalizedLevelName(level, locale)}`,
		}),
		[level, locale],
	);

	return { membership, expired, level: levelDisplay };
}
