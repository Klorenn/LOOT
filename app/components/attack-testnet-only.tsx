"use client";

import { PageHeader } from "@/components/page-header";
import { switchNetwork } from "@/lib/network";

/** La demo de ataque solo corre en testnet: en mainnet se ofrece volver (cambia la red y recarga /attack). */
export function AttackOnTestnetOnly() {
  return (
    <main>
      <PageHeader
        eyebrow="Attack demo · testnet only"
        title="The attack demo runs on testnet"
        lead="It fires real bot transactions at a sample chest, so it never runs with real funds. Switch back to testnet to try it."
      />
      <div className="mx-auto max-w-[560px] px-6 pb-16">
        <button type="button" onClick={() => switchNetwork("testnet")} className="btn-landing btn-landing-p">
          Switch to Testnet
        </button>
      </div>
    </main>
  );
}
