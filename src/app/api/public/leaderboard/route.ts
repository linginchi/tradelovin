import { jsonWithCache } from "@/lib/http-cache";

export async function GET() {
	return jsonWithCache({
		updatedAt: new Date().toISOString(),
		entries: [] as Array<{
			rank: number;
			name: string;
			score: number;
		}>,
	});
}
