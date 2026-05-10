import type { RiskMessageRow } from "@/lib/trade-v2/failure-types";

export type ApiErrorResponse = {
	success: false;
	error: string;
};

export type ApiSuccessResponse<T> = {
	success: true;
	data: T;
	error?: never;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type ApiAckResponse = { success: true } | ApiErrorResponse;

export const LEGACY_TRADE_ACCESS_DENIED_CODES = ["TRIAL_EXPIRED", "MEMBERSHIP_FORBIDDEN"] as const;
export const LEGACY_TRADE_ADVANCED_ORDER_PLANNED_CODE = "ADVANCED_ORDER_PLANNED" as const;
export const LEGACY_TRADE_ORDER_PENDING_STATUS = "pending" as const;
export const LEGACY_TRADE_ORDER_PARTIAL_STATUS = "partial" as const;
export const LEGACY_TRADE_ORDER_FILLED_STATUS = "filled" as const;
export const LEGACY_TRADE_ORDER_CANCELLED_STATUS = "cancelled" as const;
export const LEGACY_TRADE_ORDER_REJECTED_STATUS = "rejected" as const;
export const LEGACY_TRADE_ORDER_STATUSES = [
	LEGACY_TRADE_ORDER_PENDING_STATUS,
	LEGACY_TRADE_ORDER_PARTIAL_STATUS,
	LEGACY_TRADE_ORDER_FILLED_STATUS,
	LEGACY_TRADE_ORDER_CANCELLED_STATUS,
	LEGACY_TRADE_ORDER_REJECTED_STATUS,
] as const;

export type RiskMessagesApiResponse = ApiResponse<RiskMessageRow[]>;
export type TradeV2RiskMessagesReadApiResponse = ApiAckResponse;

export type TradeV2OrderExecutionData = {
	id: string;
	status: "pending" | "partial" | "filled" | "rejected";
	position_mode: "long" | "short";
	filled_qty: number;
	remaining_qty: number;
	exec_price?: number;
	price_gap_bps: number;
	liquidity_score: number;
	execution_tier: "blocked" | "queue" | "thin" | "normal" | "aggressive";
	execution_model: "threshold-v1";
	message: string;
};

export type TradeV2OrderSuccessResponse = ApiSuccessResponse<TradeV2OrderExecutionData>;

export type TradeV2OrderErrorResponse = ApiErrorResponse & {
	data?: TradeV2OrderExecutionData;
};

export type TradeV2OrderApiResponse = TradeV2OrderSuccessResponse | TradeV2OrderErrorResponse;

export type TradeV2CancelData = {
	id: string;
	status: "cancelled";
};

export type TradeV2CancelApiResponse = ApiResponse<TradeV2CancelData>;

export type TradeV2OrderListItem = {
	id: string;
	account_id: string;
	symbol: string;
	side: "buy" | "sell";
	order_type: "limit" | "market";
	price: number | string | null;
	quantity: number;
	filled_qty: number;
	status: "pending" | "partial" | "filled" | "cancelled" | "rejected";
	reject_reason: string | null;
	position_mode?: "long" | "short";
	created_at: string;
	updated_at: string;
};

export type TradeV2OrdersApiResponse = ApiResponse<TradeV2OrderListItem[]>;

export type TradeV2TradeListItem = {
	id: string;
	order_id: string | null;
	account_id: string;
	symbol: string;
	side: "buy" | "sell";
	price: number | string;
	quantity: number;
	trade_time: string;
};

export type TradeV2TradesApiResponse = ApiResponse<TradeV2TradeListItem[]>;

export type TradeV2PositionListItem = {
	id: string;
	account_id: string;
	symbol: string;
	position_type: "long" | "short";
	quantity: number;
	available_qty: number;
	cost_price: number | string;
	created_at: string;
	updated_at: string;
};

export type TradeV2PositionsApiResponse = ApiResponse<TradeV2PositionListItem[]>;

export type TradeV2QuoteDepthLevel = {
	level: number;
	price: number;
	volume: number;
};

export type TradeV2QuoteRecentTrade = {
	price: number;
	quantity: number;
	side: "buy" | "sell";
	trade_time: string;
};

export type TradeV2QuoteData = {
	symbol: string;
	name?: string;
	price: number;
	source: "tushare" | "sina";
	instrument: "stock" | "etf" | "cbond";
	lot_size: number;
	limit_band_ratio: number;
	market_mode: "l1";
	order_book?: {
		asks: TradeV2QuoteDepthLevel[];
		bids: TradeV2QuoteDepthLevel[];
	};
	recent_trades?: TradeV2QuoteRecentTrade[];
	snapshot_time?: string;
};

export type TradeV2QuoteApiResponse = ApiResponse<TradeV2QuoteData>;

export type TradeV2AccountSummary = {
	id: string;
	account_name: string;
	account_type: "normal" | "credit";
	available_balance: number;
	frozen_balance: number;
	total_assets: number;
};

export type TradeV2AccountApiResponse = ApiResponse<TradeV2AccountSummary>;

export type TradeV2UserTradePrefs = {
	default_qty: number;
	default_account_type: "normal" | "credit";
	default_position_mode: "long" | "short";
	default_source_mode: "normal" | "fast";
	auto_logout_night: boolean;
};

export type TradeV2SettingsApiResponse = ApiResponse<TradeV2UserTradePrefs>;

export type TradeV2PublicResourceItem = {
	id: string;
	symbol: string;
	name: string | null;
	long_limit: number;
	short_limit: number;
	updated_at: string;
};

export type TradeV2PersonalResourceItem = {
	id: string;
	user_id: string;
	symbol: string;
	long_quota: number;
	short_quota: number;
	dynamic_quota: number;
	updated_at: string;
};

export type TradeV2PublicResourcesApiResponse = ApiResponse<TradeV2PublicResourceItem[]>;
export type TradeV2PersonalResourcesApiResponse = ApiResponse<TradeV2PersonalResourceItem[]>;
export type TradeV2ResourceMutationApiResponse = ApiResponse<Record<string, unknown> | null>;

export type TradeV2WatchlistItem = {
	id: string;
	symbol: string;
	alert_type: "price_above" | "price_below" | "percent_up" | "percent_down";
	alert_price: number;
	triggered: boolean;
	created_at: string;
	updated_at: string;
};

export type TradeV2ConditionItem = {
	id: string;
	symbol: string;
	condition_type: "price_>=" | "price_<=";
	condition_price: number;
	order_side: "buy" | "sell";
	order_price: number;
	order_quantity: number;
	status: "active" | "triggered" | "cancelled";
	created_at: string;
	updated_at: string;
};

export type TradeV2WatchlistApiResponse = ApiResponse<TradeV2WatchlistItem[]>;
export type TradeV2WatchlistCreateApiResponse = ApiResponse<TradeV2WatchlistItem>;
export type TradeV2ConditionsApiResponse = ApiResponse<TradeV2ConditionItem[]>;
export type TradeV2ConditionCreateApiResponse = ApiResponse<TradeV2ConditionItem>;

export type TradeV2WatchlistCheckSummary = {
	checked: number;
	triggered: number;
};

export type TradeV2ConditionsTriggerSummary = {
	total: number;
	triggered: number;
	failed: number;
};

export type TradeV2WatchlistCheckApiResponse = ApiResponse<TradeV2WatchlistCheckSummary>;
export type TradeV2ConditionsTriggerApiResponse = ApiResponse<TradeV2ConditionsTriggerSummary>;

export type TradeV2ForceCloseSummary = {
	jobId: string;
	total: number;
	success: number;
	failed: number;
};

export type TradeV2ForceCloseApiResponse = ApiResponse<TradeV2ForceCloseSummary>;

export type LegacyTradeAccessDeniedCode = (typeof LEGACY_TRADE_ACCESS_DENIED_CODES)[number];

export type LegacyTradeAccount = {
	id: string;
	account_name: string;
	current_balance: number;
	frozen_balance: number;
	total_assets: number;
};

export type LegacyTradePosition = {
	symbol: string;
	name: string | null;
	quantity: number;
	available_qty: number;
	frozen_qty: number;
	cost_price: number;
	market_value: number;
	current_price: number;
};

export type LegacyTradeOrder = {
	id: string;
	symbol: string;
	name: string | null;
	side: string;
	price: number;
	quantity: number;
	filled_qty: number;
	status: LegacyTradeOrderStatus;
	created_at: string;
};

export type LegacyTradeDeal = {
	id: string;
	order_id: string | null;
	symbol: string;
	name: string | null;
	side: string;
	price: number;
	quantity: number;
	commission: number;
	stamp_tax: number;
	trade_time: string;
};

export type LegacyTradeChallengesItem = {
	code: string;
	name: string;
	durationMin: number;
	objective: string;
	rewardTitle: string;
	progress: {
		played: number;
		bestTalent: number;
	};
};

export type LegacyTradeLeaderboardItem = {
	rank: number;
	userTag: string;
	talentScore: number;
	challengeName: string;
	createdAt: string;
};

export type LegacyTradeRunResult = {
	totalScore: number;
	profitability: number;
};

export type LegacyTradeAccountApiResponse = ApiResponse<LegacyTradeAccount>;
export type LegacyTradePositionsApiResponse = ApiResponse<LegacyTradePosition[]>;
export type LegacyTradeOrdersApiResponse = ApiResponse<LegacyTradeOrder[]>;
export type LegacyTradeDealsApiResponse = ApiResponse<LegacyTradeDeal[]>;
export type LegacyTradeChallengesApiResponse = ApiResponse<LegacyTradeChallengesItem[]>;
export type LegacyTradeLeaderboardApiResponse = ApiResponse<LegacyTradeLeaderboardItem[]>;
export type LegacyTradeRunApiResponse = ApiResponse<LegacyTradeRunResult>;
export type LegacyTradeAccessErrorResponse = ApiErrorResponse & {
	code?: LegacyTradeAccessDeniedCode;
};
export type LegacyTradeAccessGuardResponse =
	| ApiSuccessResponse<LegacyTradeAccount>
	| LegacyTradeAccessErrorResponse;

export type LegacyTradeOrderSuccessData = {
	orderId: string;
	status: typeof LEGACY_TRADE_ORDER_FILLED_STATUS | typeof LEGACY_TRADE_ORDER_PARTIAL_STATUS;
	filledQty: number;
	remainingQty?: number;
	message?: string;
};

export type LegacyTradeOrderPendingData = {
	orderId: string;
	status: typeof LEGACY_TRADE_ORDER_PENDING_STATUS;
	filledQty: number;
};

export type LegacyTradeOrderSubmitSuccessResponse = ApiSuccessResponse<LegacyTradeOrderSuccessData>;

export type LegacyTradeOrderSubmitPendingResponse = {
	success: false;
	message?: string;
	data: LegacyTradeOrderPendingData;
};

export type LegacyTradeOrderSubmitErrorResponse = ApiErrorResponse & {
	code?: typeof LEGACY_TRADE_ADVANCED_ORDER_PLANNED_CODE | string;
};

export type LegacyTradeOrderSubmitApiResponse =
	| LegacyTradeOrderSubmitSuccessResponse
	| LegacyTradeOrderSubmitPendingResponse
	| LegacyTradeOrderSubmitErrorResponse;
export type LegacyMigrationNoticeResponse = ApiErrorResponse & {
	migration: string;
};

export type LegacyTradeOrderStatus = (typeof LEGACY_TRADE_ORDER_STATUSES)[number];
