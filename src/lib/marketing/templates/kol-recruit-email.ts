import { renderTemplate, type TemplateVariables } from "../renderer";

export function kolRecruitEmail(vars: TemplateVariables): string {
  return renderTemplate(
    `主题：{kolName}，邀请你的粉丝一起在交易豹赚取被动收入

{kolName}，你好！

交易豹是专注A股的模拟交易训练平台。
你的粉丝只要通过你的专属链接注册并付费，
你就可以获得该学员学费的 20% 分成。

案例：如果你本月引导 50 人付费 T2（$99/月），
你的月收入可达：50人 × $99 × 20% = $990 ≈ ¥7,200

适合谁：
· 财经类博主（小红书/抖音/公众号）
· 股票/投资社群主理人
· 交易培训师

加入方式：
1. 点击链接注册交易豹账号
2. 获取你的专属推广链接
3. 开始分享，实时查看收益

立即注册：{registrationLink}`,
    vars,
  );
}
