import type { Metadata } from "next";
import { decodeChestId } from "@/lib/chest-code";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const id = decodeChestId(code);
  return { title: id === null ? "Chest" : `Chest #${String(id).padStart(4, "0")}` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
