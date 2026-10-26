"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { SiteFooter } from "@/components/site-footer";
import { ConfigBanner, MainnetStrip } from "@/components/network-banner";
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
        <MainnetStrip />
        {children}
      </SessionProvider>
    );
  return (
    <SessionProvider>
      <ConfigBanner />
      <MainnetStrip />
      {!isLanding && (
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:rounded-[10px] focus:bg-[var(--text)] focus:px-3 focus:py-2 focus:text-[var(--bg)]"
        >
          Skip to content
        </a>
      )}
      {!isLanding && <AppNav />}
      <div id={isLanding ? undefined : "main"} className="app-main" style={{ display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0 }}>
        {children}
      </div>
      {!isLanding && <SiteFooter />}
    </SessionProvider>
  );
}
