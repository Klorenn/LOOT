"use client";

import { Horizon } from "@stellar/stellar-sdk";
import { readPrizeBalance } from "./chain";
import { PRIZE, stroopsToXlm } from "./config";
import { NETWORK } from "./client-cfg";
import type { Player } from "./wallet";

export type Asset = { code: string; label: string; amount: string; native: boolean };

/** Activos con saldo: XLM siempre; el resto solo si el saldo es > 0 (cuentas G). */
export async function loadAssets(player: Player): Promise<Asset[]> {
  if (player.kind === "passkey") {
    const b = await readPrizeBalance(player.publicKey);
    return [{ code: PRIZE.code, label: "Stellar Lumens", amount: stroopsToXlm(b), native: true }];
  }
  let acc;
  try {
    acc = await new Horizon.Server(NETWORK.horizonUrl).loadAccount(player.publicKey);
  } catch {
    // cuenta aún no creada en la red
    return [{ code: PRIZE.code, label: "Stellar Lumens", amount: "0", native: true }];
  }
  const out: Asset[] = [];
  for (const b of acc.balances) {
    if (b.asset_type === "native") {
      out.push({ code: PRIZE.code, label: "Stellar Lumens", amount: trim(b.balance), native: true });
    } else if ("asset_code" in b && Number(b.balance) > 0) {
      out.push({ code: b.asset_code, label: b.asset_code, amount: trim(b.balance), native: false });
    }
  }
  return out.length ? out : [{ code: PRIZE.code, label: "Stellar Lumens", amount: "0", native: true }];
}

const trim = (s: string) => s.replace(/\.?0+$/, "") || "0";

export type ActivityItem = {
  id: string;
  hash: string;
  kind: "Sent" | "Received" | "Prize claimed" | "Account created" | "Contract call" | "Other";
  /** "10 XLM" cuando se conoce */
  amount?: string;
  counterparty?: string;
  at: string;
};

/**
 * Actividad reciente. G: operaciones de Horizon (historial completo). C: eventos del RPC
 * (transferencias del SAC de XLM + premios de Loot): solo ~7 días de retención.
 */
export async function loadActivity(player: Player, limit = 5): Promise<ActivityItem[]> {
  if (player.kind === "passkey") {
    const res = await fetch(`/api/activity?address=${encodeURIComponent(player.publicKey)}`);
    if (!res.ok) throw new Error("activity unavailable");
    const data = (await res.json()) as {
      transfers: { hash: string; ledger: number; closedAt: string; dir: "in" | "out"; counterparty: string; amount: string }[];
      wins: { txHash: string; ledger: number; closedAt: string; prize: string }[];
    };
    const items: (ActivityItem & { ledger: number })[] = data.transfers.map((t) => ({
      id: `${t.hash}-${t.dir}`,
      hash: t.hash,
      ledger: t.ledger,
      kind: t.dir === "out" ? "Sent" : "Received",
      amount: `${stroopsToXlm(BigInt(t.amount))} ${PRIZE.code}`,
      counterparty: t.counterparty,
      at: t.closedAt,
    }));
    for (const w of data.wins) {
      // el premio ya aparece como transferencia del SAC: se reemplaza por "Prize claimed"
      const row: ActivityItem & { ledger: number } = {
        id: `${w.txHash}-win`,
        hash: w.txHash,
        ledger: w.ledger,
        kind: "Prize claimed",
        amount: `${stroopsToXlm(BigInt(w.prize))} ${PRIZE.code}`,
        at: w.closedAt,
      };
      const dup = items.findIndex((i) => i.hash === w.txHash);
      if (dup >= 0) items[dup] = row;
      else items.push(row);
    }
    return items.sort((a, b) => b.ledger - a.ledger).slice(0, limit);
  }

  const res = await new Horizon.Server(NETWORK.horizonUrl)
    .operations()
    .forAccount(player.publicKey)
    .order("desc")
    .limit(limit)
    .call()
    .catch((e: { response?: { status?: number } }) => {
      if (e?.response?.status === 404) return { records: [] };
      throw e;
    });
  return res.records.map((r): ActivityItem => {
    const o = r as unknown as Record<string, string>;
    const base = { id: o.id, hash: o.transaction_hash, at: o.created_at };
    if (o.type === "payment") {
      const incoming = o.to === player.publicKey;
      return {
        ...base,
        kind: incoming ? "Received" : "Sent",
        amount: o.asset_type === "native" ? `${trim(o.amount)} ${PRIZE.code}` : `${trim(o.amount)} ${o.asset_code}`,
        counterparty: incoming ? o.from : o.to,
      };
    }
    if (o.type === "create_account") {
      const incoming = o.account === player.publicKey;
      return {
        ...base,
        kind: incoming ? "Account created" : "Sent",
        amount: `${trim(o.starting_balance)} ${PRIZE.code}`,
        counterparty: incoming ? o.funder : o.account,
      };
    }
    if (o.type === "invoke_host_function") return { ...base, kind: "Contract call" };
    return { ...base, kind: "Other" };
  });
}
