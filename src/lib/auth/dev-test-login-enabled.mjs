/**
 * Shared enablement rules for `/api/auth/dev-test-login`.
 * Production is fail-closed: both runtime toggles must be explicitly 1/true.
 */

/**
 * @param {string | undefined} raw
 * @returns {{ defined: boolean, enabled: boolean }}
 */
export function parseEnvFlag(raw) {
	const val = String(raw ?? "")
		.trim()
		.toLowerCase();
	if (!val) return { defined: false, enabled: false };
	if (val === "1" || val === "true") return { defined: true, enabled: true };
	if (val === "0" || val === "false") return { defined: true, enabled: false };
	return { defined: false, enabled: false };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isDevTestLoginEnabled(env = process.env) {
	const runtimeToggle = parseEnvFlag(env.ENABLE_DEV_TEST_ACCOUNTS);
	const runtimeProdToggle = parseEnvFlag(env.ENABLE_DEV_TEST_ACCOUNTS_IN_PRODUCTION);
	const publicToggle = parseEnvFlag(env.NEXT_PUBLIC_ENABLE_DEV_TEST_ACCOUNTS);

	if (env.NODE_ENV !== "production") {
		if (runtimeToggle.defined) return runtimeToggle.enabled;
		// Non-production: keep prior local/dev convenience when runtime flag is unset.
		return publicToggle.defined ? publicToggle.enabled : true;
	}

	// Production fail-closed: require both runtime toggles to be explicitly enabled.
	// Missing, invalid, public-only, or single-flag configurations stay disabled.
	return runtimeToggle.enabled && runtimeProdToggle.enabled;
}
