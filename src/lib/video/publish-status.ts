export type PublishStatus = "draft" | "scheduled" | "live";

/** Live when published_at is set and not in the future. NULL = draft. */
export function isPublishedAtLive(
	publishedAt: string | null | undefined,
	now: Date = new Date(),
): boolean {
	if (!publishedAt) return false;
	const t = Date.parse(publishedAt);
	if (Number.isNaN(t)) return false;
	return t <= now.getTime();
}

export function resolvePublishStatus(
	publishedAt: string | null | undefined,
	now: Date = new Date(),
): PublishStatus {
	if (!publishedAt) return "draft";
	const t = Date.parse(publishedAt);
	if (Number.isNaN(t)) return "draft";
	if (t > now.getTime()) return "scheduled";
	return "live";
}

/** True when PostgREST/Postgres says published_at is not deployed yet. */
export function isMissingPublishedAtError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const e = error as { code?: string; message?: string };
	if (e.code === "42703" || e.code === "PGRST204") {
		const message = (e.message ?? "").toLowerCase();
		return message.includes("published_at") || !message;
	}
	const message = (e.message ?? "").toLowerCase();
	return message.includes("published_at");
}
