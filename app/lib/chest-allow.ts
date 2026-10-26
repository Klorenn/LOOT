/**
 * Mainnet: qué cofres puede tocar el relayer (claim / close_chest) y listar /explore.
 *  allowed = id habilitado (MAINNET_SAMPLE_CHEST_ID / MAINNET_LISTED_IDS)  O  creador ON-CHAIN en MAINNET_CREATOR_ALLOWLIST.
 * Cualquiera puede crear el cofre #1 en el registro público: por eso un id solo no basta como confianza para
 * cofres nuevos de desconocidos; la lista de creadores es la que habilita cofres de Pau sin tocar ids.
 * Testnet (restricted = false): sin restricción.
 */
export type ChestAllow = { restricted: boolean; ids: readonly number[] | null; creators: readonly string[] };

export function isChestAllowed(a: ChestAllow, id: number, onChainCreator: string): boolean {
  if (!a.restricted) return true;
  return !!a.ids?.includes(id) || a.creators.includes(onChainCreator);
}
