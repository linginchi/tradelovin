export type CourseSchedule = {
	id: string;
	courseName: string;
	mode: "online" | "offline";
	date: string;
	startTime: string;
	endTime: string;
	instructor: string;
	location?: string;
};
