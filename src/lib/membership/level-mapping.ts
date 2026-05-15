export const MEMBERSHIP_LEVELS = [
	{
		code: "P0",
		plan: "T0_trial",
		nameZh: "花豹",
		nameEn: "Leopard",
		nameTw: "花豹",
		descriptionZh: "斑斓多彩，初入江湖",
		descriptionEn: "Colorful and new",
		descriptionTw: "斑斕多彩，初入江湖",
	},
	{
		code: "P1",
		plan: "T1",
		nameZh: "雪豹",
		nameEn: "Snow Leopard",
		nameTw: "雪豹",
		descriptionZh: "珍稀坚韧，系统学习",
		descriptionEn: "Rare and tenacious",
		descriptionTw: "珍稀堅韌，系統學習",
	},
	{
		code: "P2",
		plan: "T2",
		nameZh: "云豹",
		nameEn: "Clouded Leopard",
		nameTw: "雲豹",
		descriptionZh: "行云流水，专业交易",
		descriptionEn: "Flowing and professional",
		descriptionTw: "行雲流水，專業交易",
	},
	{
		code: "P3",
		plan: "T3",
		nameZh: "金钱豹",
		nameEn: "Golden Leopard",
		nameTw: "金錢豹",
		descriptionZh: "财富象征，导师领袖",
		descriptionEn: "Wealth symbol, mentor",
		descriptionTw: "財富象徵，導師領袖",
	},
] as const;

export type MembershipLevel = (typeof MEMBERSHIP_LEVELS)[number];

export function getLevelByPlan(plan: string) {
	return MEMBERSHIP_LEVELS.find((level) => level.plan === plan) || MEMBERSHIP_LEVELS[0];
}

export function getLevelByCode(code: string) {
	return MEMBERSHIP_LEVELS.find((level) => level.code === code) || MEMBERSHIP_LEVELS[0];
}

export function getLocalizedLevelName(level: MembershipLevel, locale: string): string {
	if (locale === "en") return level.nameEn;
	if (locale === "zh-TW") return level.nameTw;
	return level.nameZh;
}

export function getLocalizedLevelDescription(level: MembershipLevel, locale: string): string {
	if (locale === "en") return level.descriptionEn;
	if (locale === "zh-TW") return level.descriptionTw;
	return level.descriptionZh;
}
