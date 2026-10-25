import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create a chest" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
