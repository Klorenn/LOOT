import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeChestId } from "@/lib/chest-code";
import { SetView } from "./set-view";

export const metadata: Metadata = {
  title: "Chest set",
  description: "A set of puzzle chests on Loot. Each question opens its own chest with its own prize.",
  // sets depend on the selected network and change daily: not indexed (the public list is /explore)
  robots: { index: false, follow: true },
};

export default async function SetPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (decodeChestId(code) === null) notFound();
  return <SetView code={code} />;
}
