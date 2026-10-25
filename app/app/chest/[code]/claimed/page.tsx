import { resolveChestParam } from "@/lib/chest-route";
import { ClaimedClient } from "./claimed-client";

export default async function ClaimedPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ClaimedClient chestId={resolveChestParam(code, "/claimed")} />;
}
