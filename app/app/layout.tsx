import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { AppChrome } from "@/components/app-chrome";
import { NetworkProvider } from "@/components/network-provider";
import { NET_COOKIE, effectiveNet, mainnetPublicFromEnv, parseNet } from "@/lib/network";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Loot",
    "puzzle chests",
    "riddle prize",
    "Stellar",
    "Soroban",
    "XLM",
    "zero-knowledge proofs",
    "ZK",
    "Groth16",
    "crypto bounty",
    "onchain quests",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  // canonical relativo: cada ruta apunta a sí misma (sin query), en el host www
  alternates: { canonical: "./" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
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

/** Datos estructurados (JSON-LD): el sitio y la organización. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      sameAs: ["https://github.com/Klorenn/LOOT"],
    },
  ],
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
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      style={{ "--network-strip-h": net === "mainnet" ? "32px" : "0px" } as React.CSSProperties}
    >
      <body
        className="app-shell flex flex-col bg-[var(--bg)] text-[var(--text)]"
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <NetworkProvider net={net} mainnet={mainnet}>
          <AppChrome>{children}</AppChrome>
        </NetworkProvider>
      </body>
    </html>
  );
}
