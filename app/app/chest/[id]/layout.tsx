import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Chest #${String(id).padStart(4, "0")}` };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
