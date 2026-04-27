import { jsonWithCache } from "@/lib/http-cache";

/** Placeholder schedules by student (extend with Supabase later). */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const studentId = searchParams.get("studentId") ?? "anonymous";

	return jsonWithCache({
		studentId,
		schedules: [] as Array<{
			id: string;
			courseId: string;
			date: string;
			startTime: string;
			endTime: string;
			mode: string;
			location: string | null;
		}>,
	});
}
