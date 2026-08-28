import { randomBytes } from "node:crypto";

export function generateStaffPayToken(): string {
	return randomBytes(16).toString("base64url");
}
