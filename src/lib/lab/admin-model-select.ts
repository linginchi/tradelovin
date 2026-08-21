export function resolveAdminModelSelection(activeModelId: string, healthModels: string[]): string {
	const trimmed = activeModelId.trim();
	if (healthModels.includes(trimmed)) return trimmed;
	return healthModels[0] ?? trimmed;
}
