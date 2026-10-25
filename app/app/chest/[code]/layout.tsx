import type { Metadata } from "next";
import { decodeRef } from "@/lib/chest-code";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const ref = decodeRef(code);
  if (!ref) return { title: "Chest" };
  return {
    title: ref.kind === "legacy" ? `Chest #${String(ref.id).padStart(4, "0")}` : `Chest ${code}`,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
