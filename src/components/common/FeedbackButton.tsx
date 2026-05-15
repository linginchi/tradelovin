"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FeedbackButtonProps = {
	defaultContext?: string;
};

export function FeedbackButton({ defaultContext = "trade-v2" }: FeedbackButtonProps) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [description, setDescription] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [screenshotName, setScreenshotName] = useState("");
	const [screenshotDataUrl, setScreenshotDataUrl] = useState("");

	const resetForm = () => {
		setDescription("");
		setContactEmail("");
		setScreenshotName("");
		setScreenshotDataUrl("");
	};

	const handleSubmit = async () => {
		if (!description.trim()) {
			toast.error("请先填写问题描述");
			return;
		}
		setSubmitting(true);
		try {
			const res = await fetch("/api/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					context: defaultContext,
					description: description.trim(),
					contactEmail: contactEmail.trim() || undefined,
					screenshotName: screenshotName || undefined,
					screenshotDataUrl: screenshotDataUrl || undefined,
				}),
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "提交失败，请稍后重试");
				return;
			}
			toast.success("提交成功，感谢您的反馈");
			resetForm();
			setOpen(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<>
			<Button
				type="button"
				className="fixed right-4 bottom-4 z-40 gap-2 shadow-lg"
				onClick={() => setOpen(true)}
			>
				<MessageCircle className="h-4 w-4" />
				问题反馈
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>问题反馈</DialogTitle>
						<DialogDescription>欢迎反馈交易体验、登录问题或功能建议。</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="feedback-description">问题描述</Label>
							<Textarea
								id="feedback-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="请尽量描述复现步骤、期望结果和实际结果"
								className="min-h-28"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="feedback-screenshot">截图上传（可选）</Label>
							<Input
								id="feedback-screenshot"
								type="file"
								accept="image/*"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (!file) {
										setScreenshotName("");
										setScreenshotDataUrl("");
										return;
									}
									setScreenshotName(file.name);
									const reader = new FileReader();
									reader.onload = () => {
										const value = typeof reader.result === "string" ? reader.result : "";
										setScreenshotDataUrl(value);
									};
									reader.readAsDataURL(file);
								}}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="feedback-contact">联系方式（邮箱可选）</Label>
							<Input
								id="feedback-contact"
								type="email"
								value={contactEmail}
								onChange={(e) => setContactEmail(e.target.value)}
								placeholder="you@example.com"
							/>
						</div>
					</div>
					<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
						<Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
							取消
						</Button>
						<Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
							{submitting ? "提交中..." : "提交反馈"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
