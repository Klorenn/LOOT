import type { Metadata } from "next";
import { RequireSession } from "@/components/require-session";

export const metadata: Metadata = { title: "Receive / share QR" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
