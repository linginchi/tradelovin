type DbErrorLike = {
  code?: string;
  message?: string;
};

export function isMissingRelationError(error: unknown, relation: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as DbErrorLike;
  if (e.code === "42P01") return true;
  const message = (e.message ?? "").toLowerCase();
  return message.includes(`relation "${relation.toLowerCase()}" does not exist`);
}

export function isMissingVideoViewCounterError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as DbErrorLike;
  const message = (e.message ?? "").toLowerCase();
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    (message.includes("increment_course_video_view_count") && message.includes("schema cache")) ||
    (message.includes("view_count") && message.includes("schema cache"))
  );
}
