import { notFound, permanentRedirect } from "next/navigation";
import { chestPath, decodeChestId } from "./chest-code";

/**
 * Resuelve el segmento /chest/<param> (solo servidor):
 *  - código Sqids válido → id numérico
 *  - id numérico viejo (/chest/6) → redirect 308 a la URL con código (los links viejos siguen vivos)
 *  - cualquier otra cosa → 404
 */
export function resolveChestParam(param: string, suffix = ""): number {
  const id = decodeChestId(param);
  if (id !== null) return id;
  if (/^\d{1,9}$/.test(param)) permanentRedirect(`${chestPath(Number(param))}${suffix}`);
  notFound();
}
