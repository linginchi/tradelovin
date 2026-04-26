import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/** Edge Middleware（OpenNext on Cloudflare 不支持 Node middleware；勿改用 proxy.ts） */
export default createMiddleware(routing);

export const config = {
	matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
