import type { Metadata } from "next";
import { RequireSession } from "@/components/require-session";

export const metadata: Metadata = { title: "Profile" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
