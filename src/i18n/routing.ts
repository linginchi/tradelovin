import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
	locales: ["zh", "zh-TW", "en"],
	defaultLocale: "zh",
	localePrefix: "as-needed",
});
