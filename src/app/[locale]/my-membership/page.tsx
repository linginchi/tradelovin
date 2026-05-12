import { setRequestLocale } from "next-intl/server";

import { MyMembershipClient } from "@/components/membership/MyMembershipClient";

type Props = { params: Promise<{ locale: string }> };

export default async function MyMembershipPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyMembershipClient />;
}
