import { KuyfiBadge } from "@/components/kuyfi-badge";
import { PageHeader } from "@/components/page-header";
import { CONTRACTS, IS_MAINNET, NETWORK_URLS, NORMAL_CHEST } from "@/lib/config";
import { AttackClient } from "./attack-client";

export default function AttackPage() {
  if (IS_MAINNET) {
    // La demo gasta fondos del relayer: solo corre en testnet.
    return (
      <main>
        <PageHeader
          eyebrow="Attack demo · testnet only"
          title="The attack demo runs on testnet"
          lead="It fires real bot transactions at a sample chest, so it never runs with real funds. Open it on testnet instead."
        />
        <div className="mx-auto max-w-[560px] px-6 pb-16">
          <a href={`${NETWORK_URLS.testnet.replace(/\/+$/, "")}/attack`} className="btn-landing btn-landing-p">
            Open the attack demo on testnet
          </a>
        </div>
      </main>
    );
  }
  return (
    <AttackClient
      zkBadge={<KuyfiBadge contractId={CONTRACTS.chest} />}
      normalBadge={<KuyfiBadge contractId={NORMAL_CHEST.contract} />}
    />
  );
}
