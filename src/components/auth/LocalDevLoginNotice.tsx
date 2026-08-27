import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { isLocalDevAuthHost } from "@/lib/auth/passkey";

export async function LocalDevLoginNotice() {
	const host = (await headers()).get("host") ?? "";
	if (!isLocalDevAuthHost(host)) return null;
	const t = await getTranslations("MagicLogin");
	return (
		<p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
			{t("localDevNotice")}
		</p>
	);
}
