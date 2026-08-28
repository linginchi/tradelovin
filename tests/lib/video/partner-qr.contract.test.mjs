import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("video player keeps the Guangfa partner QR under the player", async () => {
	const source = await read("src/components/video/VideoPlayerClient.tsx");
	assert.match(source, /src="\/partner-qr\.png"/);
	assert.match(source, /alt="广发证券"/);
	assert.match(source, /playJson\.playUrl/);
	const png = await stat(new URL("public/partner-qr.png", root));
	assert.ok(png.size > 0, "public/partner-qr.png must be present");
});
