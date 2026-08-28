import { StaffPayClient } from "@/components/staff-pay/StaffPayClient";
import { hasValidStaffPayCookie } from "@/lib/staff-pay/session";

export const dynamic = "force-dynamic";

export default async function StaffPayPage() {
	const unlocked = await hasValidStaffPayCookie();

	return (
		<main className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 py-10">
			<StaffPayClient
				unlocked={unlocked}
				stripeReady={Boolean(process.env.STRIPE_SECRET_KEY)}
			/>
		</main>
	);
}
