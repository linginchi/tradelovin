"use client";

import { Globe, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

type FooterLink = { label: string; href?: string };

export function SiteFooter() {
	const tNav = useTranslations("Nav");
	const tHome = useTranslations("Home");
	const tFooter = useTranslations("Footer");
	const comingSoon = tNav("comingSoon");
	const year = new Date().getFullYear();

	const columns: Array<{ title: string; links: FooterLink[] }> = [
		{
			title: tFooter("productTitle"),
			links: [
				{ label: tHome("entries.video"), href: "/courses" },
				{ label: tHome("entries.trade"), href: "/trade" },
				{ label: tHome("entries.lab"), href: "/lab" },
				{ label: tHome("entries.classroom"), href: "/my-learning" },
			],
		},
		{
			title: tFooter("resourcesTitle"),
			links: [
				{ label: tNav("support") },
				{ label: tNav("community") },
				{ label: tNav("independentTrader") },
			],
		},
		{
			title: tFooter("aboutTitle"),
			links: [
				{ label: tNav("about"), href: "/about" },
				{ label: tNav("career"), href: "/career" },
			],
		},
	];

	const legal: FooterLink[] = [
		{ label: tFooter("compliance"), href: "/about" },
		{ label: tFooter("privacy") },
		{ label: tFooter("terms") },
	];

	return (
		<footer className="border-border/60 bg-background/80 relative z-10 mt-auto border-t backdrop-blur-sm">
			<div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-14">
				<div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
					<div className="space-y-3">
						<p className="text-foreground text-base font-semibold tracking-tight">
							{tFooter("brand")}
						</p>
						<p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
							{tFooter("tagline")}
						</p>
						<div className="flex items-center gap-2 pt-1">
							{[MessageCircle, Send, Globe].map((Icon, i) => (
								<span
									key={i}
									aria-disabled
									title={comingSoon}
									className="text-muted-foreground/60 border-border/60 flex size-8 items-center justify-center rounded-full border"
								>
									<Icon className="size-4" aria-hidden />
								</span>
							))}
						</div>
					</div>

					{columns.map((col) => (
						<div key={col.title} className="space-y-3">
							<p className="text-foreground text-xs font-semibold tracking-wide uppercase">
								{col.title}
							</p>
							<ul className="space-y-2.5">
								{col.links.map((link) => (
									<li key={link.label}>
										{link.href ? (
											<Link
												href={link.href}
												className="text-muted-foreground hover:text-foreground text-sm transition-colors"
											>
												{link.label}
											</Link>
										) : (
											<span className="text-muted-foreground/55 flex items-center gap-1.5 text-sm">
												{link.label}
												<span className="text-[10px] font-medium text-amber-400/70">
													{comingSoon}
												</span>
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="border-border/50 mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-muted-foreground text-xs">{tFooter("copyright", { year })}</p>
					<ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
						{legal.map((item) => (
							<li key={item.label}>
								{item.href ? (
									<Link href={item.href} className="hover:text-foreground transition-colors">
										{item.label}
									</Link>
								) : (
									<span className="text-muted-foreground/55" title={comingSoon}>
										{item.label}
									</span>
								)}
							</li>
						))}
					</ul>
				</div>
			</div>
		</footer>
	);
}
