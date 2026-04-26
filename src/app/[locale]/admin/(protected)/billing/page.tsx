import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

/** 收费管理与「收费通知」同页 */
export default async function AdminBillingAliasPage({ params }: Props) {
	const { locale } = await params;
	redirect({ href: "/admin/fees", locale });
}
