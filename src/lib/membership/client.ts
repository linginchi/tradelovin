"use client";

import { useEffect, useMemo, useState } from "react";

export type MembershipPlan = "T0_trial" | "T0_paid" | "T1" | "T2" | "T3";

export type MembershipCurrent = {
	id?: string;
	userId?: string;
	plan: MembershipPlan;
	status?: string;
	trialEnd?: string | null;
	trialDaysLeft?: number;
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
		if (!enabled) {
			setMembership(null);
			return;
		}

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

	const expired = useMemo(() => isMembershipExpired(membership), [membership]);
	return { membership, expired };
}
