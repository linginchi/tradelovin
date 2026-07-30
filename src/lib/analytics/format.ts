/**
 * 数字格式化工具（支持客户端 & 服务端使用）
 */

/**
 * 格式化大数字：
 *   < 1000 → 原始数字
 *   1,000-9,999 → "1,234"
 *   10,000-99,999 → "1.2万"
 *   100,000+ → "12.3万"
 */
export function formatViewCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return n.toLocaleString("zh-CN");
  const wan = n / 10000;
  if (wan < 10) return `${wan.toFixed(1)}万`;
  return `${Math.round(wan)}万`;
}

/**
 * 格式化百分比增长（如 +20.5%）
 */
export function formatGrowthRate(rate: number): string {
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate}%`;
}
