/** Single class session (one row in course_schedules or mock). */
export type CourseSession = {
	id: string;
	date: string;
	startTime: string;
	endTime: string;
	mode: "online" | "offline";
	location?: string;
	instructor?: string;
};

/** Enrolled course with one or more sessions (sorted by date in UI). */
export type EnrolledCourse = {
	id: string;
	name: string;
	status: "in_progress" | "pending";
	schedules: CourseSession[];
};

/** @deprecated Use EnrolledCourse + CourseSession from messages `enrolledCourses`. */
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
