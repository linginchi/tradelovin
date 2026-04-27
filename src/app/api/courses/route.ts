import { jsonWithCache } from "@/lib/http-cache";

/** Public course catalog (placeholder until wired to DB). */
export async function GET() {
	return jsonWithCache({
		courses: [
			{
				id: "demo-1",
				slug: "intraday-foundations",
				title: "Intraday foundations",
				summary: "Structure, levels, and execution basics.",
			},
		],
	});
}
