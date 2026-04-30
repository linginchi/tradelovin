export type ChallengeDef = {
	code: string;
	name: string;
	durationMin: number;
	objective: string;
	rewardTitle: string;
};

export const CHALLENGES: ChallengeDef[] = [
	{
		code: "t0_sprint_3m",
		name: "3分钟极速场",
		durationMin: 3,
		objective: "在严格止损下完成至少2笔高质量交易",
		rewardTitle: "节奏猎手",
	},
	{
		code: "discipline_guard_10m",
		name: "纪律守门员",
		durationMin: 10,
		objective: "全场单笔亏损不超过1.2%，并保持计划执行率80%",
		rewardTitle: "风控之盾",
	},
	{
		code: "recovery_20m",
		name: "连亏修复赛",
		durationMin: 20,
		objective: "出现亏损后3笔内恢复正收益，且不加倍补仓",
		rewardTitle: "反脆弱选手",
	},
];
