import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Páginas públicas y estables. Los cofres no se listan: dependen de la red elegida y cambian a diario. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/explore", priority: 0.9, changeFrequency: "daily" },
    { path: "/create", priority: 0.8, changeFrequency: "monthly" },
    { path: "/sdk", priority: 0.7, changeFrequency: "monthly" },
    { path: "/network", priority: 0.5, changeFrequency: "monthly" },
    { path: "/attack", priority: 0.5, changeFrequency: "monthly" },
  ];
  return pages.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
