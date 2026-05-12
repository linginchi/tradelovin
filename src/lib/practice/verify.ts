import { getPracticeLevelStep, type PracticeExpected } from "@/lib/practice/levels";

function asRecord(input: unknown): Record<string, unknown> {
	return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

function normalizeString(input: unknown): string {
	return typeof input === "string" ? input.trim() : "";
}

function normalizeNumber(input: unknown): number {
	if (typeof input === "number") return input;
	if (typeof input === "string" && input.trim()) return Number(input);
	return Number.NaN;
}

function verifyByExpected(expected: PracticeExpected, userInput: unknown): boolean {
	const input = asRecord(userInput);
	switch (expected.type) {
		case "search":
			return normalizeString(input.value ?? input.symbol) === expected.value;
		case "select":
			return (
				normalizeString(input.symbol) === expected.symbol &&
				normalizeString(input.name) === expected.name
			);
		case "quantity":
			return normalizeNumber(input.value ?? input.quantity) === expected.value;
		case "price":
			return normalizeNumber(input.value ?? input.price) === expected.value;
		case "position_mode":
		case "resource_side":
			return normalizeString(input.value ?? input.mode ?? input.side) === expected.value;
		case "click_buy":
		case "click_sell":
		case "click_cancel":
		case "click_apply_resource":
		case "confirm":
		case "confirm_apply_resource":
		case "confirm_cancel":
			return normalizeString(input.action) === expected.type;
		case "select_position":
			return normalizeString(input.symbol) === expected.symbol;
		case "view_orders":
			return normalizeString(input.view) === "orders";
		case "select_order":
			return normalizeString(input.status) === expected.status;
		case "order_status": {
			const status = normalizeString(input.value ?? input.status);
			return expected.status.includes(status);
		}
		default:
			return false;
	}
}

export function verifyPracticeExpected(expected: PracticeExpected, userInput: unknown): boolean {
	return verifyByExpected(expected, userInput);
}

export type PracticeVerifyResult = {
	correct: boolean;
	expectedValue: PracticeExpected | null;
	message: string;
};

export function verifyPracticeStep(levelId: string, stepId: string, userInput: unknown): PracticeVerifyResult {
	const step = getPracticeLevelStep(levelId, stepId);
	if (!step) {
		return {
			correct: false,
			expectedValue: null,
			message: "关卡或步骤不存在",
		};
	}
	const correct = verifyByExpected(step.expected, userInput);
	return {
		correct,
		expectedValue: step.expected,
		message: correct ? "步骤校验通过" : "步骤校验未通过，请按提示重试",
	};
}
