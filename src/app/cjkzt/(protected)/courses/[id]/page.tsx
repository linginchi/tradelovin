import { AdminCourseDetailClient } from "@/components/admin/AdminCourseDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function CjkztCourseDetailPage({ params }: Props) {
	const { id } = await params;
	return (
		<main className="space-y-6">
			<AdminCourseDetailClient courseId={id} />
		</main>
	);
}
