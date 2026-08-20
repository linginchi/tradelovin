"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type TradeGuideModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	dontShowAgain: boolean;
	onDontShowAgainChange: (checked: boolean) => void;
};

export function TradeGuideModal({
	open,
	onOpenChange,
	dontShowAgain,
	onDontShowAgainChange,
}: TradeGuideModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>交易操作指引</DialogTitle>
					<DialogDescription>首次使用建议先阅读，熟悉盘口点击与快捷键。</DialogDescription>
				</DialogHeader>
				<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					<li>右上角「操作练习」是教学引导，不扣额度、不计入考核。</li>
					<li>本页是考核盘（模拟）：成交会计入 TQ 月度评分。</li>
					<li>下单前先到「资源」申请个人多头/空头额度；公共池有股不等于能直接交易。</li>
					<li>点击卖盘价格 - 快速填入价格后买入</li>
					<li>点击买盘价格 - 快速填入价格后卖出</li>
					<li>点击卖量 - 挂单买入</li>
					<li>点击买量 - 挂单卖出</li>
					<li>双击持仓行 - 平仓该持仓可用数量</li>
					<li>快捷键：买入(B)、卖出(S)、平仓(C)、清空/取消高亮(Esc)</li>
				</ul>
				<div className="flex items-center gap-2 text-sm">
					<Checkbox
						id="trade-guide-dont-show"
						checked={dontShowAgain}
						onCheckedChange={(checked) => onDontShowAgainChange(Boolean(checked))}
					/>
					<label htmlFor="trade-guide-dont-show" className="cursor-pointer">
						不再显示
					</label>
				</div>
				<DialogFooter className="border-t-0 bg-transparent p-0 sm:justify-end">
					<Button onClick={() => onOpenChange(false)}>我知道了</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
