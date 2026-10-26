import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { AppChrome } from "@/components/app-chrome";
import { NetworkProvider } from "@/components/network-provider";
import { NET_COOKIE, effectiveNet, mainnetPublicFromEnv, parseNet } from "@/lib/network";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Loot — Puzzle chests that bots can't rob",
    template: "%s · Loot",
  },
  description:
    "Solve it, prove it in zero knowledge, claim the prize on Stellar. Proofs sealed to your address.",
  applicationName: "Loot",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C0B10",
};

// La red sale de una cookie: toda la app es dinámica (nada de HTML estático con la red equivocada).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const mainnet = mainnetPublicFromEnv();
  const net = effectiveNet(parseNet((await cookies()).get(NET_COOKIE)?.value), mainnet);
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--bg)] text-[var(--text)]">
        <NetworkProvider net={net} mainnet={mainnet}>
          <AppChrome>{children}</AppChrome>
        </NetworkProvider>
      </body>
    </html>
  );
}
