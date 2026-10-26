"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { SiteFooter } from "@/components/site-footer";
import { ConfigBanner } from "@/components/network-banner";
import { SessionProvider } from "@/lib/session";

/** Site chrome for app routes — hidden on the marketing landing `/`. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isLanding = path === "/";
  const isAuth = path === "/login" || path === "/register";
  if (isAuth)
    return (
      <SessionProvider>
        <ConfigBanner />
        {children}
      </SessionProvider>
    );
  return (
    <SessionProvider>
      <ConfigBanner />
      {!isLanding && (
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:rounded-[10px] focus:bg-[var(--text)] focus:px-3 focus:py-2 focus:text-[var(--bg)]"
        >
          Skip to content
        </a>
      )}
      {!isLanding && <AppNav />}
      <div id={isLanding ? undefined : "main"} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
      {!isLanding && <SiteFooter />}
    </SessionProvider>
  );
}
