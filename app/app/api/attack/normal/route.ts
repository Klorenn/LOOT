import { NextRequest, NextResponse } from "next/server";
import { legacyOff } from "@/lib/mainnet-guard";
import { pickRpcUrl } from "@/lib/rpc";
import { CONTRACTS, NETWORK, NORMAL_CHEST } from "@/lib/config";
import { runNormalChestFlow } from "@/lib/normal-chest";

export const maxDuration = 120;

// Cada corrida gasta ~4 XLM del relayer y 2 cupos del cofre: límite en memoria
// (por instancia; suficiente para el demo, no sustituye un limiter compartido). La IP sale de
// x-forwarded-for, que un cliente puede falsear si no hay proxy de confianza delante: este
// límite frena uso accidental, no abuso deliberado.
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
    return `Too fast: wait ${wait}s before repeating the live theft.`;
  }
  if (globalRuns.length >= GLOBAL_MAX_PER_HOUR) {
    return "The live demo hit its hourly limit (it spends real testnet funds). Try again in a while.";
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
  const off = legacyOff();
  if (off) return off;
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
      rpcUrl: await pickRpcUrl(),
      passphrase: NETWORK.passphrase,
      contractId: NORMAL_CHEST.contract,
      chestId: NORMAL_CHEST.id,
      tokenId: CONTRACTS.token,
      relayerSecret: secret,
      playerAnswer: NORMAL_CHEST.answer,
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
    console.error("attack/normal", e);
    push("demo theft failed");
    return NextResponse.json({ error: "Attack demo failed. Try again in a moment.", logs }, { status: 502 });
  }
}
