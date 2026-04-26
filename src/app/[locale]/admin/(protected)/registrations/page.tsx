import { redirect } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

/** 与「报名审核」同页，便于 /admin/registrations 书签与文档路径一致 */
export default async function AdminRegistrationsAliasPage({ params }: Props) {
	const { locale } = await params;
	redirect({ href: "/admin/reviews", locale });
}
