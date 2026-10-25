import type { Metadata } from "next";

export const metadata: Metadata = { title: "Attack demo" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
