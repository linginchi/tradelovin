export function isWeChatUserAgent(userAgent: string | null | undefined): boolean {
	return /MicroMessenger/i.test(String(userAgent ?? ""));
}
