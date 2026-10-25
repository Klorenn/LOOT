"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";

/** Site chrome for app routes — hidden on the marketing landing `/`. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";
  return (
    <>
      {!isLanding && <SiteNav />}
      {children}
    </>
  );
}
