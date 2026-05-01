import { setRequestLocale } from "next-intl/server";

import { PointsCenterClient } from "@/components/points/PointsCenterClient";

type Props = { params: Promise<{ locale: string }> };

export default async function PointsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PointsCenterClient />;
}
