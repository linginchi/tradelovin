import { jsonWithCache } from "@/lib/http-cache";

/** Placeholder profile payload for future client-side hydration. */
export async function GET() {
	return jsonWithCache({
		nickname: "demo",
		email: "demo@tradelovin.example",
		enrolledCourseIds: [] as string[],
	});
}
