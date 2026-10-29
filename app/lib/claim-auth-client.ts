"use client";

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { signClaimAuthEntry } from "@findloot/chest";
import type { Player } from "./wallet";

/**
 * Registry v2 claims need the RECIPIENT's signature on the Soroban auth entry of `claim`
 * (the contract calls `recipient.require_auth()`). The relayer still pays the fee and submits.
 *
 * - demo G key (classic): signed locally with its keypair
 * - external G wallet (Stellar Wallets Kit): SEP-43 `signAuthEntry` (one wallet prompt)
 * - passkey C wallet: passkey-kit `signAuthEntry` (one WebAuthn prompt, no `connectWallet`)
 *
 * Returns the signed SorobanAuthorizationEntry as base64 XDR.
 */
export async function signClaimAuth(
  player: Player,
  authEntry: string,
  validUntilLedger: number,
  networkPassphrase: string,
): Promise<string> {
  if (player.kind === "classic") {
    if (!player.secretKey) throw new Error("demo wallet key missing in this browser");
    return signClaimAuthEntry(authEntry, Keypair.fromSecret(player.secretKey), validUntilLedger, networkPassphrase);
  }
  if (player.kind === "wallet") {
    if (!player.walletId) throw new Error("wallet session missing; reconnect your wallet");
    const { signAuthEntryWithWallet } = await import("./wallets-kit");
    return signClaimAuthEntry(
      authEntry,
      async (preimage) =>
        signAuthEntryWithWallet(preimage.toXDR("base64"), player.publicKey, player.walletId!, networkPassphrase),
      validUntilLedger,
      networkPassphrase,
    );
  }
  // passkey smart wallet (C…)
  const [{ getPasskeyKit }, { PasskeySigner, PasskeyClient }, { NETWORK }] = await Promise.all([
    import("./passkey-client"),
    import("passkey-kit"),
    import("./client-cfg"),
  ]);
  const kit = getPasskeyKit();
  bindPasskeyWallet(kit, player.publicKey, player.keyId, (contractId) =>
    new PasskeyClient({ contractId, rpcUrl: NETWORK.rpcUrl, networkPassphrase: NETWORK.passphrase }),
  );
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntry, "base64");
  const signed = await kit.signAuthEntry(entry, new PasskeySigner(player.keyId ?? "any"), {
    expiration: validUntilLedger,
  });
  return signed.toXDR("base64");
}

/**
 * Point the kit at the player's own wallet so `signAuthEntry` can run without `connectWallet`.
 *
 * passkey-kit 0.19 `connectWallet` only resolves a wallet whose birth was stored by
 * `confirmWalletCreation` (or found by an indexer) and costs an extra WebAuthn prompt; after a reload
 * or on a wallet whose birth check failed it throws and the kit stays disconnected
 * (`WalletNotConnectedError`). Signing an auth entry needs no ownership proof: the payload is
 * address-bound to `contractId`, and the wallet's `__check_auth` rejects a passkey that is not one of
 * its signers. Binding to `player.publicKey` (never to whatever the kit had) keeps the signed address
 * equal to the claim's recipient. One WebAuthn prompt per claim.
 */
export function bindPasskeyWallet<W extends { options: { contractId: string } }>(
  kit: { wallet?: W; keyId?: string },
  contractId: string,
  keyId: string | undefined,
  makeClient: (contractId: string) => W,
): void {
  if (!contractId.startsWith("C")) throw new Error("passkey player is not a smart wallet (C…) address");
  if (kit.wallet?.options.contractId !== contractId) kit.wallet = makeClient(contractId);
  if (keyId) kit.keyId = keyId;
}
