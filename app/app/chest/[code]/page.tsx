import { notFound } from "next/navigation";
import { KuyfiBadge } from "@/components/kuyfi-badge";
import { CONTRACTS } from "@/lib/config";
import { resolveChestRef } from "@/lib/chest-route";
import { encodeRef } from "@/lib/chest-code";
import { factoryAddressAt } from "@/lib/factory";
import { ChestSolve } from "./chest-solve";

export default async function ChestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ref = resolveChestRef(code);
  if (ref.kind === "legacy") {
    // KuyfiBadge es server component (lee el reporte real); se pasa como slot al cliente.
    return (
      <ChestSolve
        code={encodeRef(ref)}
        legacyId={ref.id}
        badge={<KuyfiBadge contractId={CONTRACTS.chest} />}
      />
    );
  }
  const address = await factoryAddressAt(ref.index).catch(() => null);
  if (!address) notFound();
  return (
    <ChestSolve code={encodeRef(ref)} address={address} badge={<KuyfiBadge contractId={address} />} />
  );
}
