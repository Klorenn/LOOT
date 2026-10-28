import type { Metadata } from "next";
import { decodeChestId } from "@/lib/chest-code";
import { displayId } from "@/lib/registry";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const id = decodeChestId(code);
  return {
    title: id === null ? "Chest" : `Chest #${String(displayId(id)).padStart(4, "0")}`,
    description: "A puzzle chest on Loot. Solve the riddle in your browser and claim the prize with a proof sealed to your address.",
    // los cofres dependen de la red elegida y cambian a diario: no se indexan (la lista pública es /explore)
    robots: { index: false, follow: true },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
