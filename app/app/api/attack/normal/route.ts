import { NextRequest, NextResponse } from "next/server";
import { CONTRACTS, DEMO_CHEST, NETWORK, NORMAL_CHEST } from "@/lib/config";
import { runNormalChestFlow } from "@/lib/normal-chest";

export const maxDuration = 120;

// Cada corrida gasta ~4 XLM del relayer y 2 cupos del cofre: límite en memoria
// (por instancia; suficiente para el demo, no sustituye un limiter compartido).
const PER_IP_WINDOW_MS = 60_000;
const GLOBAL_WINDOW_MS = 3_600_000;
const GLOBAL_MAX_PER_HOUR = 6;
const lastByIp = new Map<string, number>();
let globalRuns: number[] = [];

function rateLimit(ip: string): string | null {
  const now = Date.now();
  globalRuns = globalRuns.filter((t) => now - t < GLOBAL_WINDOW_MS);
  for (const [k, t] of lastByIp) if (now - t >= PER_IP_WINDOW_MS) lastByIp.delete(k);
  const last = lastByIp.get(ip);
  if (last !== undefined) {
    const wait = Math.ceil((PER_IP_WINDOW_MS - (now - last)) / 1000);
    return `Demasiado rápido: esperá ${wait}s antes de repetir el robo real.`;
  }
  if (globalRuns.length >= GLOBAL_MAX_PER_HOUR) {
    return "El demo en vivo alcanzó su límite por hora (gasta fondos reales de testnet). Probá en un rato.";
  }
  lastByIp.set(ip, now);
  globalRuns.push(now);
  return null;
}

/**
 * Lado "cofre normal" del modo ataque, 100% on-chain: el jugador cobra con la
 * respuesta en claro y el bot la lee del ledger y cobra con su cuenta.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limited = rateLimit(ip);
  if (limited) {
    return NextResponse.json(
      { error: limited, logs: [] },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const logs: string[] = [];
  const push = (m: string) => {
    logs.push(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
  };

  const secret = process.env.RELAYER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RELAYER_SECRET missing", logs }, { status: 500 });
  }

  try {
    const r = await runNormalChestFlow({
      rpcUrl: NETWORK.rpcUrl,
      passphrase: NETWORK.passphrase,
      contractId: NORMAL_CHEST.contract,
      chestId: NORMAL_CHEST.id,
      tokenId: CONTRACTS.token,
      assetCode: NORMAL_CHEST.assetCode,
      assetIssuer: NORMAL_CHEST.assetIssuer,
      relayerSecret: secret,
      playerAnswer: DEMO_CHEST.answer,
      log: push,
    });
    return NextResponse.json({
      playerTx: r.playerTx,
      botTx: r.botTx,
      answerReadFromLedger: r.answerReadFromLedger,
      paidTo: r.paidTo,
      botBalance: r.botBalance,
      logs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    push(`falló: ${message}`);
    return NextResponse.json({ error: message, logs }, { status: 502 });
  }
}
