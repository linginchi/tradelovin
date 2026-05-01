import type { TqEnvironment, TqPeriod } from "@/lib/tq/constants";

export function readTqEnv(value: string | null): TqEnvironment {
	return value === "live" ? "live" : "sim";
}

export function readTqPeriod(value: string | null): TqPeriod {
	return value === "daily" || value === "weekly" || value === "monthly" ? value : "all";
}

