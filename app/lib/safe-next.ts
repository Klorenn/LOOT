/**
 * Redirección post-login segura: solo rutas relativas del mismo origen.
 * Rechaza "//host", URLs absolutas, backslashes (algunos navegadores los tratan como "/")
 * y cualquier carácter de control.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  if (next.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  // "/\t/evil", "/%2f/…" decodificados: se valida también la forma decodificada
  try {
    const dec = decodeURIComponent(next);
    if (dec.startsWith("//") || dec.includes("\\")) return null;
  } catch {
    return null;
  }
  // Auth no debe redirigir a sí misma en bucle
  if (/^\/(login|register)(\/|\?|$)/.test(next)) return null;
  return next;
}
