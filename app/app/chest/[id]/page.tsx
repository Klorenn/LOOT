import { KuyfiBadge } from "@/components/kuyfi-badge";
import { CONTRACTS } from "@/lib/config";
import { ChestSolve } from "./chest-solve";

export default function ChestPage() {
  // KuyfiBadge es server component (lee el reporte real); se pasa como slot al cliente.
  return <ChestSolve badge={<KuyfiBadge contractId={CONTRACTS.chest} />} />;
}
