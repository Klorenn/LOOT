import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attack demo",
  description: "Watch a bot copy a proof and lose: the proof is sealed to your address, so the contract rejects it.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
