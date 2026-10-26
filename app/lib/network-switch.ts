/** URL del despliegue hermano conservando ruta y query (nunca el #fragmento: puede llevar la sal privada). */
export function otherNetworkUrl(base: string, pathname: string, search: string): string {
  const root = base.replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const q = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${root}${path}${q}`;
}
