"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app/app-nav";
import { SiteFooter } from "@/components/app/site-footer";

/** Site chrome for app routes — hidden on the marketing landing `/`. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";
  return (
    <>
      {!isLanding && <AppNav />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {!isLanding && <SiteFooter />}
    </>
  );
}
