import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Todo lo público se indexa; la API, el panel admin y las pantallas de cuenta no. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/panel", "/dashboard", "/profile", "/wallet", "/claimed-chests", "/login", "/register", "/states"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
