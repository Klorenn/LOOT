/**
 * Mainnet: quién puede guardar metadatos off-chain (evita spam de storage; el relayer ya no patrocina otros cofres).
 *  - reserve (aún no hay id): el creador declarado debe estar en MAINNET_CREATOR_ALLOWLIST (csv de G… / C…);
 *  - confirm: el id está habilitado (MAINNET_SAMPLE_CHEST_ID / MAINNET_LISTED_IDS) O el creador está en la lista.
 * Además del chequeo existente: el creador declarado debe coincidir con el creador on-chain. Testnet no restringe.
 */
export type MetaGate = { mainnet: boolean; creatorAllowlist: readonly string[]; allowedChestIds: readonly number[] | null };

export function parseCreatorAllowlist(csv: string | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[GC][A-Z2-7]{55}$/.test(x));
}

export function canReserve(g: MetaGate, creator: string): boolean {
  return !g.mainnet || g.creatorAllowlist.includes(creator);
}

export function canConfirm(g: MetaGate, creator: string, chestId: number): boolean {
  if (!g.mainnet) return true;
  return g.creatorAllowlist.includes(creator) || !!g.allowedChestIds?.includes(chestId);
}
