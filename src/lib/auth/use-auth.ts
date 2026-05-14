"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type MeApi = {
	success?: boolean;
	loggedIn?: boolean;
	userId?: string | null;
	email?: string | null;
	nickname?: string | null;
	hasEnrollment?: boolean;
};

export type AuthUser = {
	userId: string;
	email: string | null;
	nickname: string | null;
	hasEnrollment: boolean;
};

export function useAuth() {
	const [status, setStatus] = useState<AuthStatus>("loading");
	const [user, setUser] = useState<AuthUser | null>(null);

	const refresh = useCallback(async () => {
		try {
			const res = await fetch("/api/auth/me", {
				method: "GET",
				credentials: "include",
				cache: "no-store",
			});
			const js = (await res.json()) as MeApi;
			if (!res.ok || !js.success || !js.loggedIn || !js.userId) {
				setStatus("unauthenticated");
				setUser(null);
				return;
			}
			setStatus("authenticated");
			setUser({
				userId: js.userId,
				email: js.email ?? null,
				nickname: js.nickname ?? null,
				hasEnrollment: !!js.hasEnrollment,
			});
		} catch {
			setStatus("unauthenticated");
			setUser(null);
		}
	}, []);

	useEffect(() => {
		let mounted = true;
		const run = async () => {
			await refresh();
			if (!mounted) return;
		};
		void run();

		const timer = window.setInterval(() => {
			void refresh();
		}, 10 * 60 * 1000);

		const sb = getSupabaseBrowserClient();
		const authListener = sb?.auth.onAuthStateChange((event) => {
			if (event === "TOKEN_REFRESHED") {
				console.info("[auth] token refreshed, session extended");
			}
			void refresh();
		});

		return () => {
			mounted = false;
			window.clearInterval(timer);
			authListener?.data.subscription.unsubscribe();
		};
	}, [refresh]);

	return useMemo(
		() => ({
			status,
			user,
			isLoading: status === "loading",
			isAuthed: status === "authenticated",
			refresh,
		}),
		[refresh, status, user],
	);
}
