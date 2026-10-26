/** Datos del sitio para SEO (metadata, sitemap, robots, JSON-LD). La URL canónica es www (el apex redirige 308). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.findloot.xyz").replace(/\/+$/, "");
export const SITE_NAME = "Loot";
export const SITE_TITLE = "Loot — Puzzle chests that bots can't rob";
export const SITE_DESCRIPTION =
  "Solve the riddle, win the prize. Loot locks XLM behind a puzzle on Stellar: you prove the answer in zero knowledge and the proof is sealed to your address, so bots can't copy it.";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Loot: puzzle chests that bots can't rob. Solve the riddle. Win the prize." };
