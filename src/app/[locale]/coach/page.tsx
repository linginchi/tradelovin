import { setRequestLocale } from "next-intl/server";

import { CoachDeskClient } from "@/components/coach/CoachDeskClient";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function CoachPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
			<CoachDeskClient />
		</main>
	);
}
