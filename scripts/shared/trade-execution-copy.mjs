import {
	TRADE_ORDER_MESSAGE_CANCELLED,
	TRADE_ORDER_MESSAGE_FILLED,
	TRADE_ORDER_MESSAGE_PARTIAL,
	TRADE_ORDER_MESSAGE_PENDING,
	TRADE_ORDER_MESSAGE_REJECTED,
} from "./trade-execution-messages.mjs";

export const EXECUTION_STATUS_TEXT = {
	pending: "已挂单",
	partial: "部分成交",
	filled: "已成交",
	rejected: "已拒单",
	cancelled: "已撤单",
};

export const EXECUTION_DEFAULT_DETAIL = {
	pending: TRADE_ORDER_MESSAGE_PENDING,
	partial: TRADE_ORDER_MESSAGE_PARTIAL,
	filled: TRADE_ORDER_MESSAGE_FILLED,
	rejected: TRADE_ORDER_MESSAGE_REJECTED,
	cancelled: TRADE_ORDER_MESSAGE_CANCELLED,
};

export function resolveExecutionStatusText(status) {
	return EXECUTION_STATUS_TEXT[String(status ?? "").toLowerCase()] ?? `未知状态(${String(status ?? "unknown")})`;
}

export function resolveExecutionTone(status) {
	const normalized = String(status ?? "").toLowerCase();
	if (normalized === "filled") return "success";
	if (normalized === "rejected") return "error";
	return "warning";
}

export function buildExecutionLogCopy(input) {
	const sideText = String(input?.side ?? "buy").toLowerCase() === "sell" ? "卖出" : "买入";
	const modeText = String(input?.positionMode ?? "long").toLowerCase() === "short" ? "做空" : "做多";
	const normalizedStatus = String(input?.status ?? "").toLowerCase();
	const statusText = resolveExecutionStatusText(normalizedStatus);
	const tierText = input?.executionTier ? ` / ${String(input.executionTier)}` : "";
	const liqNum = Number(input?.liquidityScore);
	const liqText = Number.isFinite(liqNum) ? ` / 流动性${liqNum.toFixed(2)}` : "";
	const fallbackMessage = EXECUTION_DEFAULT_DETAIL[normalizedStatus] ?? "";
	const messageRaw = input?.message ? String(input.message) : fallbackMessage;
	const messageText = messageRaw ? `（${messageRaw}）` : "";
	return `${modeText}${sideText}：${statusText}${tierText}${liqText}${messageText}`;
}
