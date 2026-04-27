import { redirect } from "next/navigation";

import { ADMIN_BASE_PATH } from "@/lib/admin/paths";

/** 与「报名审核」同页 */
export default function CjkztRegistrationsRedirectPage() {
	redirect(`${ADMIN_BASE_PATH}/reviews`);
}
