import { jsonWithCache } from "@/lib/http-cache";

export async function GET() {
	return jsonWithCache({
		badges: [] as Array<{
			id: string;
			name: string;
			description: string;
		}>,
	});
}
