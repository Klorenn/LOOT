import { NextResponse } from "next/server";

/**
 * Retirado: ya no se crean cofres con una clave del servidor. El creador firma `create_chest`
 * con su propia cuenta y paga el premio (ver lib/create-chest.ts). Metadatos: /api/chests/meta.
 */
export function POST() {
  return NextResponse.json(
    { error: "gone: create chests from your own account at /create" },
    { status: 410 },
  );
}
