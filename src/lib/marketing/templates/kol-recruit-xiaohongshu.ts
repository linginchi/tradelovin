import { renderTemplate, type TemplateVariables } from "../renderer";

export function kolRecruitXiaohongshu(vars: TemplateVariables): string {
  return renderTemplate(
    `最近发现一个A股模拟交易平台——交易豹，我用了两个月，TQ评分系统确实能看出自己的交易短板。

他们最近在找合作KOL，粉丝通过你的链接付费，你能拿到20%的分成。如果你的粉丝里有人做股票交易的，这算是个躺着赚点零花钱的机会。

想了解的评论扣1，我私信你链接

#交易豹 #KOL合作 #模拟交易 #副业`,
    vars,
  );
}
