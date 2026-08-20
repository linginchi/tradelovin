"use client";

import { MessageCircleWarning } from "lucide-react";
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
	collectDiagnostics?: () => string;
};

export function FeedbackButton({
	defaultContext = "trade-v2",
	collectDiagnostics,
}: FeedbackButtonProps) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [description, setDescription] = useState("");
	const [contact, setContact] = useState("");
	const [diagnostics, setDiagnostics] = useState("");
	const [screenshotName, setScreenshotName] = useState("");
	const [screenshotDataUrl, setScreenshotDataUrl] = useState("");

	const resetForm = () => {
		setDescription("");
		setContact("");
		setDiagnostics("");
		setScreenshotName("");
		setScreenshotDataUrl("");
	};

	const openDialog = () => {
		setDiagnostics(collectDiagnostics?.() ?? "");
		setOpen(true);
	};

	const handleSubmit = async () => {
		if (!description.trim()) {
			toast.error("请先填写你遇到的问题", {
				description: "下一步：用自己的话写下刚才做了什么、期望是什么、实际看到什么。",
			});
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
					contact: contact.trim() || undefined,
					diagnostics: diagnostics.trim() || undefined,
					screenshotName: screenshotName || undefined,
					screenshotDataUrl: screenshotDataUrl || undefined,
				}),
			});
			const json = (await res.json()) as { success?: boolean; error?: string };
			if (!res.ok || !json.success) {
				toast.error(json.error ?? "提交失败，请稍后重试", {
					description: "下一步：检查网络后重试，或把诊断信息复制下来发给管理员。",
				});
				return;
			}
			toast.success("测试反馈已提交，感谢你");
			resetForm();
			setOpen(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试", {
				description: "下一步：检查网络后重试，或把诊断信息复制下来发给管理员。",
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<>
			<Button
				type="button"
				size="sm"
				className="bg-orange-500 font-semibold text-white shadow-md hover:bg-orange-600"
				onClick={openDialog}
			>
				<MessageCircleWarning className="mr-1 h-4 w-4" />
				测试反馈
			</Button>
			<Button
				type="button"
				className="fixed right-4 bottom-4 z-50 h-14 gap-2 rounded-full bg-orange-500 px-5 text-base font-bold text-white shadow-2xl ring-4 ring-orange-300/70 hover:bg-orange-600"
				onClick={openDialog}
			>
				<MessageCircleWarning className="h-5 w-5" />
				测试遇到问题？点此反馈
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>测试问题反馈</DialogTitle>
						<DialogDescription>
							请用自己的话说明刚才发生了什么。下面的诊断信息会自动附上，方便定位原因。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="feedback-description">你遇到的问题（必填）</Label>
							<Textarea
								id="feedback-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="例如：我点了卖出开空，提示额度不足；我已经在资源页看过公共池，但不知道怎么申请。"
								className="min-h-28"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="feedback-contact">你的联系方式（微信号 / 邮箱 / 手机，可选）</Label>
							<Input
								id="feedback-contact"
								value={contact}
								onChange={(e) => setContact(e.target.value)}
								placeholder="方便回访时填写"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="feedback-screenshot">截图（可选）</Label>
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
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor="feedback-diagnostics">自动诊断信息</Label>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										void navigator.clipboard.writeText(diagnostics);
										toast.success("诊断信息已复制");
									}}
								>
									复制
								</Button>
							</div>
							<Textarea
								id="feedback-diagnostics"
								value={diagnostics}
								readOnly
								className="min-h-36 font-mono text-[11px] text-muted-foreground"
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
