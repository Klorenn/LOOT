import type { Metadata } from "next";
import { RequireSession } from "@/components/require-session";

export const metadata: Metadata = { title: "My claimed chests" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
