import { KuyfiBadge } from "@/components/kuyfi-badge";
import { AttackOnTestnetOnly } from "@/components/attack-testnet-only";
import { cfg } from "@/lib/cfg";
import { NORMAL_CHEST } from "@/lib/config";
import { AttackClient } from "./attack-client";

export default async function AttackPage() {
  const { IS_MAINNET, CONTRACTS } = await cfg();
  // La demo gasta fondos del relayer: solo corre en testnet.
  if (IS_MAINNET) return <AttackOnTestnetOnly />;
  return (
    <AttackClient
      zkBadge={<KuyfiBadge contractId={CONTRACTS.chest} />}
      normalBadge={<KuyfiBadge contractId={NORMAL_CHEST.contract} />}
    />
  );
}
