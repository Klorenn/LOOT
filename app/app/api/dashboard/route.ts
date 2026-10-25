import { NextRequest, NextResponse } from "next/server";
import { dashboardFor } from "@/lib/listing";

/** Cofres creados por `address` + KPIs reales (cadena + eventos). Solo lectura pública. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!/^[GC][A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await dashboardFor(address, req.nextUrl.searchParams.get("fresh") === "1"));
  } catch (e) {
    console.error("dashboard", e);
    return NextResponse.json({ error: "chain read failed" }, { status: 502 });
  }
}
