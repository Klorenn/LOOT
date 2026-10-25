import { KuyfiBadge } from "@/components/kuyfi-badge";
import { CONTRACTS } from "@/lib/config";
import { resolveChestParam } from "@/lib/chest-route";
import { ChestSolve } from "./chest-solve";

export default async function ChestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const chestId = resolveChestParam(code);
  // KuyfiBadge es server component (lee el reporte real); se pasa como slot al cliente.
  return (
    <ChestSolve chestId={chestId} badge={<KuyfiBadge contractId={CONTRACTS.chest} />} />
  );
}
