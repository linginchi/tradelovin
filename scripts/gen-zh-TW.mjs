import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Converter } from "opencc-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const cn2tw = Converter({ from: "cn", to: "tw" });

function transformStrings(value) {
	if (typeof value === "string") {
		let s = cn2tw(value);
		// 品牌与产品用语（OpenCC 已处理大部分；此处补固定文案）
		s = s.replace(/Tradelovin/g, "Tradelovin");
		return s;
	}
	if (Array.isArray(value)) {
		return value.map(transformStrings);
	}
	if (value !== null && typeof value === "object") {
		const out = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = transformStrings(v);
		}
		return out;
	}
	return value;
}

const zh = JSON.parse(readFileSync(join(root, "messages", "zh.json"), "utf8"));
const zhTW = transformStrings(zh);
writeFileSync(join(root, "messages", "zh-TW.json"), `${JSON.stringify(zhTW, null, "\t")}\n`, "utf8");
console.log("Wrote messages/zh-TW.json");
