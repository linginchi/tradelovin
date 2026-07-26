import type { SupabaseClient } from "@supabase/supabase-js";

/** Tumbling dedup window: one countable view per viewer, per video, per window. */
export const VIEW_DEDUP_WINDOW_SECONDS = 30 * 60;

type DbErrorLike = {
	code?: string;
	message?: string;
};

/**
 * True when the visible counter / recording RPC is not deployed yet.
 * Callers degrade instead of reporting a successful count or inventing zeros.
 */
export function isMissingViewCounterError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const e = error as DbErrorLike;
	if (e.code === "42883" || e.code === "42703" || e.code === "PGRST202" || e.code === "PGRST204") {
		return true;
	}
	const message = (e.message ?? "").toLowerCase();
	return (
		message.includes("record_course_video_view") ||
		message.includes("increment_course_video_view_count") ||
		message.includes("video_view_events") ||
		(message.includes("view_count") && message.includes("schema cache"))
	);
}

/** Start of the tumbling window a timestamp falls into (client-side helper / tests). */
export function viewWindowStart(now: Date): string {
	const windowMs = VIEW_DEDUP_WINDOW_SECONDS * 1000;
	return new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
}

export type RecordVideoViewResult = {
	/** Whether this request produced a new view event and incremented the counter. */
	counted: boolean;
	/** Visible aggregate after the call, or null when it could not be resolved. */
	viewCount: number | null;
	/** The view-count schema is not deployed yet; nothing was recorded. */
	degraded: boolean;
};

type AtomicViewResult = {
	counted?: boolean;
	view_count?: number | string | null;
};

/**
 * Records one real-playback view for an already-authorized, signed-in viewer.
 *
 * Dedup insert and counter increment run inside one SECURITY DEFINER RPC
 * transaction, so a fresh event cannot permanently exist without the +1.
 */
export async function recordVideoView(
	srv: SupabaseClient,
	params: { videoId: string; userId: string },
): Promise<RecordVideoViewResult> {
	const { data, error } = await srv.rpc("record_course_video_view", {
		p_video_id: params.videoId,
		p_user_id: params.userId,
	});

	if (error) {
		// Any RPC failure degrades: never invent a counted=true or a fake total.
		return { counted: false, viewCount: null, degraded: true };
	}

	const payload = (data ?? null) as AtomicViewResult | null;
	if (!payload || typeof payload !== "object") {
		return { counted: false, viewCount: null, degraded: true };
	}

	const rawCount = payload.view_count;
	return {
		counted: Boolean(payload.counted),
		viewCount: rawCount == null ? null : Number(rawCount),
		degraded: false,
	};
}
