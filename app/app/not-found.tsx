import type { Metadata } from "next";
import { DEMO_PATH } from "@/lib/demo";
import Link from "next/link";
import { LogoChest } from "@/components/logo-chest";
import { chestPath } from "@/lib/chest-code";
import { DEMO_CHEST } from "@/lib/config";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[640px] flex-col items-center justify-center px-6 py-20 text-center">
      <LogoChest className="w-[180px] lg:w-[220px]" deg={28} showInside />
      <p className="mt-10 font-mono text-[12px] tracking-[0.1em] text-[var(--dim)] uppercase">
        ERROR 404
      </p>
      <h1 className="mt-4 text-[clamp(36px,5vw,56px)] leading-[1.02] font-semibold tracking-[-0.04em]">
        This chest is{" "}
        <em className="not-italic text-[var(--proof)]">empty.</em>
      </h1>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={DEMO_PATH} className="btn-landing btn-landing-p">
          Open a chest →
        </Link>
        <Link href="/" className="btn-landing btn-landing-s">
          Home
        </Link>
      </div>
    </main>
  );
}
