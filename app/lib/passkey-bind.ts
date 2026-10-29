/**
 * Point the kit at the player's own wallet so `signAuthEntry` can run without `connectWallet`.
 *
 * passkey-kit 0.19 `connectWallet` only resolves a wallet whose birth was stored by
 * `confirmWalletCreation` (or found by an indexer) and costs an extra WebAuthn prompt; after a reload
 * or on a wallet whose birth check failed it throws and the kit stays disconnected
 * (`WalletNotConnectedError`). Signing an auth entry needs no ownership proof: the payload is
 * address-bound to `contractId`, and the wallet's `__check_auth` rejects a passkey that is not one of
 * its signers. Binding to `player.publicKey` (never to whatever the kit had) keeps the signed address
 * equal to the claim's recipient. One WebAuthn prompt per signature, none to "connect".
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
