import Link from "next/link";

import { RegistrationForm } from "@/components/registration-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
	title: "课程报名 · 豹仔乐园",
	description: "填写报名信息，加入豹仔乐园日内交易学习。",
};

export default function RegisterPage() {
	return (
		<div className="relative flex min-h-full flex-1 flex-col">
			<div className="border-border/60 bg-background/80 supports-backdrop-filter:bg-background/60 sticky top-0 z-10 border-b backdrop-blur-md">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
					<Link
						href="/"
						className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
					>
						← 返回首页
					</Link>
					<span className="text-muted-foreground text-sm">豹仔乐园</span>
				</div>
			</div>
			<div className="flex flex-1 flex-col items-center px-4 py-10 md:py-16">
				<RegistrationForm />
			</div>
		</div>
	);
}
