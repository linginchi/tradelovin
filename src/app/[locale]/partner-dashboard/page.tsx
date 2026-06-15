import { setRequestLocale } from "next-intl/server";

import { PartnerDashboardClient } from "@/components/channel-partner/PartnerDashboardClient";

type Props = { params: Promise<{ locale: string }> };

export default async function PartnerDashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PartnerDashboardClient />;
}
