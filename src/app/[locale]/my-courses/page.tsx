import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function MyCoursesLegacyPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	redirect({ href: "/my-learning", locale });
}
