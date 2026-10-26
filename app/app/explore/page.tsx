import type { Metadata } from "next";
import { listExploreRows, type ChestRowData } from "@/lib/listing";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = { title: "Explore chests" };
// Lectura de cadena en el servidor, cacheada ~30 s (ISR).

export default async function ExplorePage() {
  let rows: ChestRowData[] = [];
  let error = false;
  try {
    rows = await listExploreRows();
  } catch (e) {
    console.error("explore: chain read failed", e);
    error = true;
  }
  return <ExploreClient rows={rows} error={error} />;
}
