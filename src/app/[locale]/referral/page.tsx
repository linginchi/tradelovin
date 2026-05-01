import { setRequestLocale } from "next-intl/server";

import { ReferralCenterClient } from "@/components/referral/ReferralCenterClient";

type Props = { params: Promise<{ locale: string }> };

export default async function ReferralPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ReferralCenterClient />;
}
