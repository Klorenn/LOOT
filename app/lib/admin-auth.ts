import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/** Returns a 403 response unless `x-admin-key` matches env ADMIN_KEY (unset → always 403). */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_KEY;
  const given = req.headers.get("x-admin-key") ?? "";
  if (expected && given.length === expected.length) {
    if (timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
