import { NET_COOKIE, parseNet, type Net } from "@/lib/network";

/** Registra cómo el servidor lee la red de la petición (cookie `loot_net`); ver lib/cfg.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { cookies } = await import("next/headers");
  (globalThis as { __lootServerNet?: () => Promise<Net | null> }).__lootServerNet = async () => {
    try {
      return parseNet((await cookies()).get(NET_COOKIE)?.value);
    } catch {
      return null; // fuera de una petición (build/prerender): testnet por defecto
    }
  };
}
