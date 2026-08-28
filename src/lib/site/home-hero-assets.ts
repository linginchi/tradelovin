const SUPABASE_ASSETS =
	"https://bpuqqyqmrtchaqfouygm.supabase.co/storage/v1/object/public/assets";

/** Full-size hero background (WebP, ~144KB). */
export const HOME_HERO_WEBP_URL = `${SUPABASE_ASSETS}/home_hero_v1.webp`;

/** Tiny LQIP blur placeholder (~220B). */
export const HOME_HERO_LQIP_URL = `${SUPABASE_ASSETS}/home_hero_v1_lqip.webp`;

/** PNG fallback for browsers without WebP. */
export const HOME_HERO_PNG_URL = `${SUPABASE_ASSETS}/home_hero_v1.png`;
