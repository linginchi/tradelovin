export const HUB_TOPIC_SORT = {
	classic: 10,
	recorded: 20,
	live: 30,
} as const;

export type HubTopicMessageKey = "hubClassic" | "hubRecorded" | "hubLive";

export function hubTopicMessageKey(sortOrder: number): HubTopicMessageKey | null {
	if (sortOrder === HUB_TOPIC_SORT.classic) return "hubClassic";
	if (sortOrder === HUB_TOPIC_SORT.recorded) return "hubRecorded";
	if (sortOrder === HUB_TOPIC_SORT.live) return "hubLive";
	return null;
}

export function isLiveHubTopic(sortOrder: number): boolean {
	return sortOrder === HUB_TOPIC_SORT.live;
}
