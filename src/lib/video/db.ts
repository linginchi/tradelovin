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
