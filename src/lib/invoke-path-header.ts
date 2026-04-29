/** 由 middleware 写入请求头，根 layout 读取以设置 `<html lang>` */
export const INVOKE_PATH_HEADER = "x-invoke-path";

export function htmlLangFromPathname(pathname: string): string {
	if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
	if (pathname === "/zh-TW" || pathname.startsWith("/zh-TW/")) return "zh-Hant";
	return "zh-CN";
}
