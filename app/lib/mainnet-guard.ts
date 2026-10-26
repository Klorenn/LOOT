import { NextResponse } from "next/server";
import { IS_MAINNET } from "./config";

/** Rutas de demo/legacy (registro viejo, modo ataque, panel admin): apagadas en mainnet. */
export function legacyOff(): NextResponse | null {
  return IS_MAINNET ? NextResponse.json({ error: "not available on mainnet" }, { status: 404 }) : null;
}
