import { Button } from "@/components/ui/button";

export default function Home() {
	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
			<div className="max-w-lg space-y-2 text-center">
				<h1 className="text-3xl font-semibold tracking-tight">TradeLovin</h1>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Next.js · Tailwind CSS v4 · shadcn/ui（深色）· OpenNext for Cloudflare
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-center gap-3">
				<Button>主按钮</Button>
				<Button variant="secondary">次要</Button>
				<Button variant="outline">线框</Button>
			</div>
		</main>
	);
}
