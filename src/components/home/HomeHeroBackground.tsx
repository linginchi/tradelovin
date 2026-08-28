"use client";

import { useState } from "react";

import {
	HOME_HERO_LQIP_URL,
	HOME_HERO_PNG_URL,
	HOME_HERO_WEBP_URL,
} from "@/lib/site/home-hero-assets";
import { cn } from "@/lib/utils";

export function HomeHeroBackground() {
	const [loaded, setLoaded] = useState(false);

	return (
		<div className="absolute inset-0 -z-10" aria-hidden>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={HOME_HERO_LQIP_URL}
				alt=""
				decoding="async"
				className={cn(
					"absolute inset-0 size-full scale-110 object-cover object-[center_35%] blur-lg transition-opacity duration-500",
					loaded ? "opacity-0" : "opacity-100",
				)}
			/>
			<picture>
				<source srcSet={HOME_HERO_WEBP_URL} type="image/webp" />
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={HOME_HERO_PNG_URL}
					alt=""
					fetchPriority="high"
					decoding="async"
					onLoad={() => setLoaded(true)}
					className={cn(
						"absolute inset-0 size-full object-cover object-[center_35%] transition-opacity duration-500",
						loaded ? "opacity-100" : "opacity-0",
					)}
				/>
			</picture>
			<div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/80" />
			<div className="absolute inset-0 bg-black/30" />
		</div>
	);
}
