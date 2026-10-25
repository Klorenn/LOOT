import { KuyfiBadge } from "@/components/kuyfi-badge";
import { CONTRACTS, NORMAL_CHEST } from "@/lib/config";
import { AttackClient } from "./attack-client";

export default function AttackPage() {
  return (
    <AttackClient
      zkBadge={<KuyfiBadge contractId={CONTRACTS.chest} />}
      normalBadge={<KuyfiBadge contractId={NORMAL_CHEST.contract} />}
    />
  );
}
