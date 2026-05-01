import { setRequestLocale } from "next-intl/server";

import { MembershipCenterClient } from "@/components/membership/MembershipCenterClient";

type Props = { params: Promise<{ locale: string }> };

export default async function MembershipPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MembershipCenterClient />;
}
