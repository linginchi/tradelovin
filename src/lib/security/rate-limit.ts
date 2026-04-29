type RateBucket = {
	hits: number[];
};

const store = new Map<string, RateBucket>();

function nowMs(): number {
	return Date.now();
}

export function clientIpFromHeaders(headers: Headers): string {
	const cf = headers.get("cf-connecting-ip");
	if (cf) return cf;
	const xff = headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0]?.trim() || "unknown";
	return "unknown";
}

export function checkRateLimit(params: {
	bucket: string;
	key: string;
	windowMs: number;
	maxHits: number;
}): { limited: boolean; retryAfterSec: number } {
	const stamp = nowMs();
	const id = `${params.bucket}:${params.key}`;
	const windowStart = stamp - params.windowMs;

	const b = store.get(id) ?? { hits: [] };
	b.hits = b.hits.filter((t) => t >= windowStart);

	if (b.hits.length >= params.maxHits) {
		const oldest = b.hits[0] ?? stamp;
		const retryAfterSec = Math.max(1, Math.ceil((oldest + params.windowMs - stamp) / 1000));
		store.set(id, b);
		return { limited: true, retryAfterSec };
	}

	b.hits.push(stamp);
	store.set(id, b);
	return { limited: false, retryAfterSec: 0 };
}
