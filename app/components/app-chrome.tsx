"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/app/site-footer";
import { SessionProvider } from "@/lib/session";

/** Site chrome for app routes — hidden on the marketing landing `/`. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";
  return (
    <SessionProvider>
      {!isLanding && <AppHeader />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {!isLanding && <SiteFooter />}
    </SessionProvider>
  );
}
