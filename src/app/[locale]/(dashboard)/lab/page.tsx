import { setRequestLocale } from "next-intl/server";

import { LabEntryClient } from "@/components/lab/LabEntryClient";

type Props = Readonly<{ params: Promise<{ locale: string }> }>;

export default async function LabPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	return <LabEntryClient />;
}
