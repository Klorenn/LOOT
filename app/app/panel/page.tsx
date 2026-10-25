"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Row = {
  id: number;
  template: string;
  question: string;
  prize: number;
  maxClaims: number;
  createdAt: string;
};

export default function PanelPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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
    if (!confirm(`¿Cerrar cofre #${id} y retirar remanente?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/chests/${id}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "close failed");
      alert(`Cerrado. Refund ${data.refunded} · ${data.hash?.slice(0, 12)}…`);
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
                  {r.prize} CHEST
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/chest/${r.id}`}
                      className="text-[#4C8DFF] underline"
                    >
                      open
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === r.id}
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
