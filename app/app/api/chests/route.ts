import { NextResponse } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import { Client, networks } from "@findloot/chest";
import { DEMO_CHEST, NETWORK } from "@/lib/config";
import { withRpcUrl } from "@/lib/rpc";
import { listChests } from "@/lib/chest-store";

/** true = exists on-chain, false = ChestNotFound (#1), null = could not verify. */
async function existsOnChain(id: number): Promise<boolean | null> {
  const secret = process.env.RELAYER_SECRET;
  if (!secret) return null;
  try {
    return await withRpcUrl(async (rpcUrl) => {
      const client = new Client({
        ...networks.testnet,
        rpcUrl,
        allowHttp: true,
        publicKey: Keypair.fromSecret(secret).publicKey(),
      });
      const tx = await client.get_chest({ chest_id: BigInt(id) });
      return tx.result.isOk();
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/Error\(Contract,\s*#1\)|ChestNotFound/i.test(message)) return false;
    return null;
  }
}

export async function GET() {
  // Solo cofres públicos; la sal no sale en el listado.
  const stored = (await listChests()).map(({ salt: _s, ...c }) => (void _s, c));
  const demo = {
    id: DEMO_CHEST.id,
    template: "bounty",
    question: DEMO_CHEST.question,
    hint: DEMO_CHEST.hint,
    prize: DEMO_CHEST.prize,
    maxClaims: DEMO_CHEST.slots,
    createdAt: "2026-10-25T12:00:00Z",
  };
  const ids = new Set(stored.map((c) => c.id));
  const all = ids.has(demo.id) ? stored : [demo, ...stored];
  const chests = await Promise.all(
    all.map(async (c) => ({ ...c, onchain: await existsOnChain(c.id) })),
  );
  return NextResponse.json({ chests });
}
