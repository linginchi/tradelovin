export type PracticeExpected =
	| { type: "search"; value: string }
	| { type: "select"; symbol: string; name: string }
	| { type: "quantity"; value: number }
	| { type: "price"; value: number }
	| { type: "click_buy" }
	| { type: "click_sell" }
	| { type: "click_cancel" }
	| { type: "click_apply_resource" }
	| { type: "position_mode"; value: "long" | "short" }
	| { type: "order_status"; status: string[] }
	| { type: "resource_side"; value: "long" | "short" };

export type PracticeLevelStep = {
	id: string;
	instruction: string;
	expected: PracticeExpected;
};

export type PracticeLevel = {
	id: string;
	title: string;
	steps: PracticeLevelStep[];
};

export const PRACTICE_LEVELS: Record<string, PracticeLevel> = {
	buy_stock: {
		id: "buy_stock",
		title: "普通买入",
		steps: [
			{ id: "search", instruction: "在搜索框输入股票代码「000001」", expected: { type: "search", value: "000001" } },
			{
				id: "select",
				instruction: "点击搜索结果中的「平安银行」",
				expected: { type: "select", symbol: "000001", name: "平安银行" },
			},
			{ id: "quantity", instruction: "输入买入数量「1000」", expected: { type: "quantity", value: 1000 } },
			{ id: "buy", instruction: "点击「买入」按钮", expected: { type: "click_buy" } },
			{
				id: "confirm",
				instruction: "确认委托状态变为「已报」或「成交」",
				expected: { type: "order_status", status: ["pending", "filled"] },
			},
		],
	},
	sell_stock: {
		id: "sell_stock",
		title: "普通卖出",
		steps: [
			{ id: "search", instruction: "输入持仓代码「000001」", expected: { type: "search", value: "000001" } },
			{ id: "quantity", instruction: "输入卖出数量「500」", expected: { type: "quantity", value: 500 } },
			{ id: "sell", instruction: "点击「卖出」按钮", expected: { type: "click_sell" } },
			{ id: "confirm", instruction: "确认委托状态变为「已报」或「成交」", expected: { type: "order_status", status: ["pending", "filled"] } },
		],
	},
	cancel_order: {
		id: "cancel_order",
		title: "撤单操作",
		steps: [
			{ id: "search", instruction: "输入股票代码「000001」", expected: { type: "search", value: "000001" } },
			{ id: "cancel", instruction: "在当日委托中点击「撤单」", expected: { type: "click_cancel" } },
			{ id: "confirm", instruction: "确认委托状态变为「已撤」", expected: { type: "order_status", status: ["cancelled"] } },
		],
	},
	short_sell: {
		id: "short_sell",
		title: "融券做空",
		steps: [
			{ id: "mode", instruction: "切换到「融券做空」模式", expected: { type: "position_mode", value: "short" } },
			{ id: "search", instruction: "输入做空标的「000001」", expected: { type: "search", value: "000001" } },
			{ id: "quantity", instruction: "输入做空数量「200」", expected: { type: "quantity", value: 200 } },
			{ id: "sell", instruction: "点击「卖出/做空」按钮", expected: { type: "click_sell" } },
			{ id: "confirm", instruction: "确认空头委托状态已报或成交", expected: { type: "order_status", status: ["pending", "filled"] } },
		],
	},
	cover_short: {
		id: "cover_short",
		title: "平空仓",
		steps: [
			{ id: "mode", instruction: "保持在「融券做空」模式", expected: { type: "position_mode", value: "short" } },
			{ id: "search", instruction: "输入标的「000001」", expected: { type: "search", value: "000001" } },
			{ id: "quantity", instruction: "输入平仓数量「200」", expected: { type: "quantity", value: 200 } },
			{ id: "buy", instruction: "点击「买入/平空」按钮", expected: { type: "click_buy" } },
			{ id: "confirm", instruction: "确认空头仓位减少", expected: { type: "order_status", status: ["filled"] } },
		],
	},
	apply_resource: {
		id: "apply_resource",
		title: "资源申请",
		steps: [
			{ id: "search", instruction: "输入资源标的「000001」", expected: { type: "search", value: "000001" } },
			{ id: "side", instruction: "选择「做空资源」", expected: { type: "resource_side", value: "short" } },
			{ id: "quantity", instruction: "输入申请数量「1000」", expected: { type: "quantity", value: 1000 } },
			{ id: "apply", instruction: "点击「申请资源」按钮", expected: { type: "click_apply_resource" } },
			{ id: "confirm", instruction: "确认申请结果显示成功", expected: { type: "order_status", status: ["approved", "pending"] } },
		],
	},
};

export const LEVELS = PRACTICE_LEVELS;

export function getPracticeLevel(levelId: string): PracticeLevel | null {
	return PRACTICE_LEVELS[levelId] ?? null;
}

export function getPracticeLevelStep(levelId: string, stepId: string): PracticeLevelStep | null {
	const level = getPracticeLevel(levelId);
	if (!level) return null;
	return level.steps.find((step) => step.id === stepId) ?? null;
}
