import { renderTemplate, type TemplateVariables } from "../renderer";

export function studentConvertEmail(vars: TemplateVariables): string {
  return renderTemplate(
    `主题：{kolName}推荐你使用交易豹

{studentName}，你好！

我是{kolName}，一直在用的交易豹，
今天把它的模拟交易系统推荐给你。

为什么推荐？
· 真实A股行情模拟交易，零风险练手
· TQ能力评分系统，量化你的交易水平
· 系统化课程，从入门到进阶

通过我的链接注册，立享：
· 7天免费试用

链接：{referralLink}
邀请码：{refCode}`,
    vars,
  );
}
