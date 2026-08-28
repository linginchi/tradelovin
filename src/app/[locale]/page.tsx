import { preload } from "react-dom";

import { HomePageClient } from "@/components/home/HomePageClient";
import { HOME_HERO_WEBP_URL } from "@/lib/site/home-hero-assets";

export default function HomePage() {
	preload(HOME_HERO_WEBP_URL, { as: "image", fetchPriority: "high" });
	return <HomePageClient />;
}
