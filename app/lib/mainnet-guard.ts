import { NextResponse } from "next/server";
import { cfg } from "./cfg";

/** Rutas de demo/legacy (registro viejo, modo ataque, panel admin): solo en testnet. */
export async function legacyOff(): Promise<NextResponse | null> {
  return (await cfg()).IS_MAINNET ? NextResponse.json({ error: "not available on mainnet" }, { status: 404 }) : null;
}
