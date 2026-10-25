import { KuyfiBadge } from "@/components/kuyfi-badge";
import { KUYFI_CHEST_SCAN, NORMAL_CHEST } from "@/lib/config";
import { AttackClient } from "./attack-client";

export default function AttackPage() {
  return (
    <AttackClient
      zkBadge={<KuyfiBadge contractId={KUYFI_CHEST_SCAN} />}
      normalBadge={<KuyfiBadge contractId={NORMAL_CHEST.contract} />}
    />
  );
}
