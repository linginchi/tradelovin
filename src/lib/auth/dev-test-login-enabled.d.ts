export function parseEnvFlag(raw: string | undefined): { defined: boolean; enabled: boolean };

export function isDevTestLoginEnabled(
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean;
