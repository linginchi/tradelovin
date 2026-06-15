import { renderTemplate, type TemplateVariables } from "../renderer";

export function studentConvertXiaohongshu(vars: TemplateVariables): string {
  return renderTemplate(
    `最近在用交易豹做A股模拟交易，感觉还不错。实时行情、模拟盘、TQ评分都有，适合想练手的朋友。

想试试的可以走我的邀请链接，有7天免费试用：{referralLink}

#模拟交易 #股票 #交易豹 #投资入门`,
    vars,
  );
}
