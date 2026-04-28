import { z } from "zod";

export const tradingStyleValueEnum = z.enum([
	"trend_following",
	"reversal",
	"breakout",
	"range_bound",
	"scalping",
	"order_book",
	"quant",
	"undecided",
]);

export const registerExperienceEnum = z.enum(["none", "lt_1y", "y1_3", "gt_3", "professional"]);

export const registerPayloadSchema = z.object({
	email: z.string().trim().email(),
	nickname: z.string().trim().min(1),
	realName: z.union([z.string().trim(), z.null()]).optional(),
	phone: z.union([z.string().trim(), z.null()]).optional(),
	tradingExperience: registerExperienceEnum,
	tradingStylePreferences: z.array(tradingStyleValueEnum).max(3),
	learningGoals: z.union([z.string().trim(), z.null()]).optional(),
	willingToRecommend: z.boolean(),
});

export type RegisterPayload = z.infer<typeof registerPayloadSchema>;

/** 接受 camelCase（或 snake_case 备选）的请求体 */
export function normalizeRegisterBody(raw: unknown): { ok: true; payload: RegisterPayload } | { ok: false } {
	if (!raw || typeof raw !== "object") return { ok: false };
	const o = raw as Record<string, unknown>;

	const email = typeof o.email === "string" ? o.email.trim() : "";
	const nickname = typeof o.nickname === "string" ? o.nickname.trim() : "";

	const realRaw = o.realName ?? o.real_name;
	const realName =
		typeof realRaw === "string" && realRaw.trim() ? realRaw.trim() : null;

	const phoneRaw = o.phone;
	const phone = typeof phoneRaw === "string" && phoneRaw.trim() ? phoneRaw.trim() : null;

	const tspRaw = Array.isArray(o.tradingStylePreferences)
		? o.tradingStylePreferences
		: Array.isArray(o.trading_style_preferences)
			? o.trading_style_preferences
			: [];
	const tradingStylePreferencesRaw = tspRaw.filter((x): x is string => typeof x === "string");
	const tradingStylePreferences: z.infer<typeof registerPayloadSchema>["tradingStylePreferences"] = [];
	for (const x of tradingStylePreferencesRaw) {
		if (tradingStylePreferences.length >= 3) break;
		const p = tradingStyleValueEnum.safeParse(x);
		if (p.success) tradingStylePreferences.push(p.data);
	}

	let tradingExperienceRaw =
		typeof o.tradingExperience === "string"
			? o.tradingExperience.trim()
			: typeof o.trading_experience === "string"
				? o.trading_experience.trim()
				: "none";
	const expParsed = registerExperienceEnum.safeParse(tradingExperienceRaw);
	const tradingExperience = expParsed.success ? expParsed.data : "none";

	const lgRaw = o.learningGoals ?? o.learning_goals;
	const learningGoals =
		typeof lgRaw === "string" && lgRaw.trim() ? lgRaw.trim() : null;

	const wre = o.willingToRecommend ?? o.willing_to_recommend;
	let willingToRecommend = false;
	if (typeof wre === "boolean") willingToRecommend = wre;
	else if (wre === "yes") willingToRecommend = true;

	const parsed = registerPayloadSchema.safeParse({
		email,
		nickname,
		realName,
		phone,
		tradingExperience,
		tradingStylePreferences,
		learningGoals,
		willingToRecommend,
	});

	if (!parsed.success) return { ok: false };
	return { ok: true, payload: parsed.data };
}
