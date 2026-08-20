export const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
export const MAX_SCREENSHOT_DATA_URL_LENGTH = Math.ceil(MAX_SCREENSHOT_BYTES * (4 / 3)) + 128;

export type ScreenshotAttachment = {
	filename: string;
	contentType: string;
	content: Buffer;
};

function safeFilename(raw: string | undefined): string {
	const cleaned = (raw ?? "screenshot.png")
		.replace(/[^\w.\-\u4e00-\u9fff ]+/g, "_")
		.trim()
		.slice(0, 120);
	return cleaned || "screenshot.png";
}

export function parseScreenshotDataUrl(
	dataUrl: string | undefined,
	filename?: string,
): { ok: true; attachment: ScreenshotAttachment } | { ok: false; error: string } | { ok: true; attachment: null } {
	if (!dataUrl) {
		return { ok: true, attachment: null };
	}
	if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_LENGTH) {
		return { ok: false, error: "截图过大，请压缩到 3MB 以内后再上传" };
	}
	const matched = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!matched) {
		return { ok: false, error: "截图格式无法解析" };
	}
	const contentType = matched[1] || "application/octet-stream";
	if (!contentType.startsWith("image/")) {
		return { ok: false, error: "截图必须是图片文件" };
	}
	let content: Buffer;
	try {
		content = Buffer.from(matched[2], "base64");
	} catch {
		return { ok: false, error: "截图格式无法解析" };
	}
	if (content.length === 0) {
		return { ok: false, error: "截图内容为空" };
	}
	if (content.length > MAX_SCREENSHOT_BYTES) {
		return { ok: false, error: "截图过大，请压缩到 3MB 以内后再上传" };
	}
	return {
		ok: true,
		attachment: {
			filename: safeFilename(filename),
			contentType,
			content,
		},
	};
}
