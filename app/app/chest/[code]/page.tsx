import { KuyfiBadge } from "@/components/kuyfi-badge";
import { resolveChestParam } from "@/lib/chest-route";
import { ChestSolve } from "./chest-solve";
import { cfg } from "@/lib/cfg";

export default async function ChestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { CONTRACTS } = await cfg();
  const { code } = await params;
  const chestId = resolveChestParam(code);
  // KuyfiBadge es server component (lee el reporte real); se pasa como slot al cliente.
  return (
    <ChestSolve chestId={chestId} badge={<KuyfiBadge contractId={CONTRACTS.chest} />} />
  );
}
