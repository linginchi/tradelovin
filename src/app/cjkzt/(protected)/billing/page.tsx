import { redirect } from "next/navigation";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";

export default function CjkztBillingRedirectPage() {
	redirect(`${ADMIN_BASE_PATH}/fees`);
}
