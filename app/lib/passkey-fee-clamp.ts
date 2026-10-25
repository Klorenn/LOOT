"use client";

import { TransactionBuilder, xdr } from "@stellar/stellar-sdk";

const UINT32_MAX = 0xffffffff;
const CLAMPED_RESOURCE = UINT32_MAX - 10_000;

let patched = false;

/**
 * passkey-kit's shared-deployer path builds a carrier tx only to extract
 * `{func,auth}`. AssembledTransaction still calls TransactionBuilder.build(),
 * which throws when simulation's resourceFee alone exceeds uint32 (seen on
 * Protocol 29 testnet: ~5e9 stroops). The carrier is never submitted as-is —
 * `/api/passkey/send` rebuilds fees with the relayer — so clamping is safe.
 */
export function ensurePasskeyFeeClamp(): void {
  if (patched || typeof window === "undefined") return;
  patched = true;

  const original = TransactionBuilder.prototype.build;
  TransactionBuilder.prototype.build = function clampedBuild(
    this: TransactionBuilder,
  ) {
    try {
      return original.call(this);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("exceeds the maximum uint32")) throw e;

      const self = this as TransactionBuilder & {
        sorobanData?: xdr.SorobanTransactionData | null;
        baseFee: string;
      };
      if (!self.sorobanData) throw e;

      const rf = BigInt(self.sorobanData.resourceFee().toString());
      if (rf > BigInt(CLAMPED_RESOURCE)) {
        self.sorobanData.resourceFee(
          xdr.Int64.fromString(String(CLAMPED_RESOURCE)),
        );
      }
      // Keep inclusion tiny so classic + resource stays under uint32.
      self.baseFee = "100";
      console.warn(
        "[passkey] clamped carrier resourceFee for shared-deployer build",
        { was: rf.toString(), now: CLAMPED_RESOURCE },
      );
      return original.call(this);
    }
  };
}
