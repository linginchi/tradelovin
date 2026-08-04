export type MembershipTier = "T1" | "T2" | "T3";

export type MembershipCapability =
	| "sim_trading"
	| "tq_report"
	| "l2_market"
	| "advanced_order_bundle"
	| "lab_access";

export type MembershipSnapshot = {
	userId: string;
	tier: MembershipTier;
	status: "active" | "paused" | "expired" | "trialing";
	trialStartAt: string;
	trialEndAt: string;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	lastPaidAt: string | null;
	pointsBalance: number;
	effective: {
		simTrading: boolean;
		tqReport: boolean;
		l2Market: boolean;
		advancedOrderBundle: boolean;
		labAccess: boolean;
	};
};
