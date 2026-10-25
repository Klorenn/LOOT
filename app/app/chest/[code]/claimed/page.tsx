import { encodeRef } from "@/lib/chest-code";
import { resolveChestRef } from "@/lib/chest-route";
import { ClaimedClient } from "./claimed-client";

export default async function ClaimedPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ref = resolveChestRef(code, "/claimed");
  return (
    <ClaimedClient
      code={encodeRef(ref)}
      label={ref.kind === "legacy" ? `#${String(ref.id).padStart(4, "0")}` : encodeRef(ref)}
    />
  );
}
