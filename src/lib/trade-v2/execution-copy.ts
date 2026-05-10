import {
	TRADE_ORDER_MESSAGE_CANCELLED,
	TRADE_ORDER_MESSAGE_FILLED,
	TRADE_ORDER_MESSAGE_PARTIAL,
	TRADE_ORDER_MESSAGE_PENDING,
	TRADE_ORDER_MESSAGE_REJECTED,
} from "@/lib/trade/execution-messages";

export type UnifiedExecutionStatus = "pending" | "partial" | "filled" | "rejected" | "cancelled";

type ExecutionCopyInput = {
	side?: "buy" | "sell";
	positionMode?: "long" | "short";
	status: UnifiedExecutionStatus;
	serverMessage?: string;
	executionTier?: string;
	liquidityScore?: number;
};

export type ExecutionResultInput = ExecutionCopyInput;

export type ExecutionToastTone = "success" | "warning" | "error";
export type ExecutionStatusBadgeVariant = "success" | "muted" | "outline" | "warning";

export function resolveExecutionToastTone(status: UnifiedExecutionStatus): ExecutionToastTone {
	if (status === "filled") return "success";
	if (status === "rejected") return "error";
	return "warning";
}

export function resolveExecutionStatusText(status: UnifiedExecutionStatus): string {
	if (status === "filled") return "已成交";
	if (status === "partial") return "部分成交";
	if (status === "pending") return "已挂单";
	if (status === "rejected") return "已拒单";
	return "已撤单";
}

export function resolveExecutionStatusBadgeVariant(
	status: UnifiedExecutionStatus,
): ExecutionStatusBadgeVariant {
	if (status === "filled") return "success";
	if (status === "partial") return "outline";
	if (status === "rejected") return "warning";
	return "muted";
}

export function resolveExecutionDetailText(status: UnifiedExecutionStatus, serverMessage?: string): string {
	if (serverMessage) return serverMessage;
	if (status === "filled") return TRADE_ORDER_MESSAGE_FILLED;
	if (status === "partial") return TRADE_ORDER_MESSAGE_PARTIAL;
	if (status === "pending") return TRADE_ORDER_MESSAGE_PENDING;
	if (status === "rejected") return TRADE_ORDER_MESSAGE_REJECTED;
	return TRADE_ORDER_MESSAGE_CANCELLED;
}

export function buildExecutionToastCopy(input: ExecutionCopyInput): string {
	const modeText = input.positionMode === "short" ? "做空" : "做多";
	const sideText = input.side === "sell" ? "卖出" : "买入";
	const statusText = resolveExecutionStatusText(input.status);
	const tierText = input.executionTier ? ` / ${input.executionTier}` : "";
	const liquidityText =
		typeof input.liquidityScore === "number" && Number.isFinite(input.liquidityScore)
			? ` / 流动性${input.liquidityScore.toFixed(2)}`
			: "";
	const messageText = input.serverMessage ? `（${input.serverMessage}）` : "";
	return `${modeText}${sideText}：${statusText}${tierText}${liquidityText}${messageText}`;
}

export function buildExecutionResultView(input: ExecutionResultInput): {
	statusText: string;
	badgeVariant: ExecutionStatusBadgeVariant;
	tone: ExecutionToastTone;
	detailText: string;
	toastText: string;
} {
	return {
		statusText: resolveExecutionStatusText(input.status),
		badgeVariant: resolveExecutionStatusBadgeVariant(input.status),
		tone: resolveExecutionToastTone(input.status),
		detailText: resolveExecutionDetailText(input.status, input.serverMessage),
		toastText: buildExecutionToastCopy(input),
	};
}
