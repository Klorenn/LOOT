import type { Metadata } from "next";
import { RequireSession } from "@/components/require-session";

export const metadata: Metadata = {
  title: "Create a chest",
  description: "Lock XLM behind a riddle, set a deadline and share the link. Only the hash of the answer goes on-chain.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
