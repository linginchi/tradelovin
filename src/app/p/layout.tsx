import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default function PublicPayLayout({ children }: { children: ReactNode }) {
	return <div className="min-h-full flex-1 bg-background">{children}</div>;
}
