"use client";

import dynamic from "next/dynamic";

const MobileBottomNav = dynamic(
	() => import("@/components/layout/MobileBottomNav"),
	{ ssr: false },
);

export function BottomNavShell() {
	return <MobileBottomNav />;
}
