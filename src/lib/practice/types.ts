export interface PracticeStageInfo {
	key: string;
	title: string;
	description: string;
	icon?: string;
}

export interface PracticeCompleteResponse {
	success?: boolean;
	newTotalScore?: number;
	newStage?: PracticeStageInfo | null;
	currentStage?: PracticeStageInfo | null;
}
