export type RiskFailureMeta = {
	orderId?: string;
	symbol?: string;
	side?: string;
	positionMode?: string;
	quantity?: number;
	price?: number;
	executionTier?: string;
	liquidityScore?: number;
	priceGapBps?: number;
	executionModel?: string;
};

export type RiskFailureRow = {
	id: string;
	code: string | null;
	content: string;
	meta?: RiskFailureMeta;
	created_at: string;
};

export type RiskMessageLevel = "info" | "warning" | "error";

export type RiskMessageRow = RiskFailureRow & {
	level: RiskMessageLevel;
	title: string;
	read_at: string | null;
};
