"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { chestPath } from "@/lib/chest-code";

type Row = {
  id: number;
  template: string;
  question: string;
  prize: number;
  maxClaims: number;
  createdAt: string;
  onchain?: boolean | null;
};

export default function PanelPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adminKey, setAdminKey] = useState("");

  useEffect(() => {
    try {
      setAdminKey(sessionStorage.getItem("chestzk.adminKey") || "");
    } catch {
      /* ignore */
    }
  }, []);

  function saveKey(v: string) {
    setAdminKey(v);
    try {
      sessionStorage.setItem("chestzk.adminKey", v);
    } catch {
      /* ignore */
    }
  }

  function reload() {
    fetch("/api/chests")
      .then((r) => r.json())
      .then((d) => setRows(d.chests || []))
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    reload();
  }, []);

  async function closeChest(id: number) {
    if (!confirm(`Close chest #${id} and withdraw the remaining prize?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/chests/${id}/close`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error("Admin key invalid or missing (403)");
      if (!res.ok) throw new Error(data.error || "close failed");
      alert(`Closed. Refunded ${data.refunded} · ${data.hash?.slice(0, 12)}…`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            Panel
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            Your chests
          </h1>
        </div>
        <Link
          href="/create"
          className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground"
        >
          Create chest
        </Link>
      </div>

      <label className="flex flex-col gap-2">
        <span className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
          Clave de admin (para cerrar cofres)
        </span>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => saveKey(e.target.value)}
          autoComplete="off"
          className="h-10 rounded-2xl border border-input bg-background px-4 text-sm"
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border font-mono text-xs tracking-[0.04em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3">Prize</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono">{r.id}</td>
                <td className="px-4 py-3">{r.template}</td>
                <td className="max-w-[14rem] truncate px-4 py-3">
                  {r.question}
                </td>
                <td className="px-4 py-3 font-mono text-gold">
                  {r.prize} XLM
                  {r.onchain === false && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      no creado
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={chestPath(r.id)}
                      className="text-[#4C8DFF] underline"
                    >
                      open
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === r.id || r.onchain === false}
                      onClick={() => closeChest(r.id)}
                      className="h-8 text-destructive"
                    >
                      {busyId === r.id ? "…" : "close"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No chests yet. Create one from /create.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
