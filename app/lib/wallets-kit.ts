"use client";

/**
 * Stellar Wallets Kit, cargado solo en el cliente y bajo demanda: el kit usa
 * preact + window y no puede evaluarse en SSR. Solo se piden direcciones; la
 * prueba ZK se envía por el relayer, así que no se firma nada con la wallet.
 */
type Kit = typeof import("@creit.tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let loading: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!loading) {
    loading = (async () => {
      const [{ StellarWalletsKit }, { Networks }, freighter, xbull, albedo, lobstr, hana, rabet] =
        await Promise.all([
          import("@creit.tech/stellar-wallets-kit/sdk"),
          import("@creit.tech/stellar-wallets-kit/types"),
          import("@creit.tech/stellar-wallets-kit/modules/freighter"),
          import("@creit.tech/stellar-wallets-kit/modules/xbull"),
          import("@creit.tech/stellar-wallets-kit/modules/albedo"),
          import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
          import("@creit.tech/stellar-wallets-kit/modules/hana"),
          import("@creit.tech/stellar-wallets-kit/modules/rabet"),
        ]);
      StellarWalletsKit.init({
        modules: [
          new freighter.FreighterModule(),
          new xbull.xBullModule(),
          new albedo.AlbedoModule(),
          new lobstr.LobstrModule(),
          new hana.HanaModule(),
          new rabet.RabetModule(),
        ],
        network: Networks.TESTNET,
      });
      return StellarWalletsKit;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Abre el selector de wallets y devuelve la cuenta G… elegida y el id del módulo. */
export async function connectGWallet(): Promise<{ address: string; walletId: string }> {
  const kit = await loadKit();
  const { address } = await kit.authModal();
  return { address, walletId: kit.selectedModule.productId };
}

/**
 * Vuelve a enlazar la wallet recordada sin abrir el selector. Devuelve la
 * dirección que la wallet reporta ahora, o null si no se pudo consultar en
 * silencio (extensión bloqueada, sin permiso, etc.).
 */
export async function restoreGWallet(walletId: string): Promise<string | null> {
  try {
    const kit = await loadKit();
    kit.setWallet(walletId);
    const { address } = await kit.selectedModule.getAddress({ skipRequestAccess: true });
    return address || null;
  } catch {
    return null;
  }
}

export async function disconnectGWallet(): Promise<void> {
  try {
    const kit = await loadKit();
    await kit.disconnect();
  } catch {
    /* nada que desconectar */
  }
}
