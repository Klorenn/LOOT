import { NextRequest, NextResponse } from "next/server";
import { NET_COOKIE, parseNet } from "@/lib/network";

/** `?net=mainnet|testnet` en un enlace compartido fija la red (cookie) y redirige al enlace limpio. */
export function proxy(req: NextRequest) {
  const net = parseNet(req.nextUrl.searchParams.get("net"));
  if (!net) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.searchParams.delete("net");
  const res = NextResponse.redirect(url);
  res.cookies.set(NET_COOKIE, net, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  return res;
}

export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
