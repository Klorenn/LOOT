"use client";

import { useState } from "react";
import Link from "next/link";
import { ChestVisual } from "@/components/chest-visual";
import { Button } from "@/components/ui/button";
import { DEMO_CHEST } from "@/lib/config";
import { loadPlayer, enrollWithPasskey } from "@/lib/wallet";
import { recipientField } from "@/lib/recipient";
import { proveChest } from "@/lib/zk";

type LogLine = { t: string; msg: string; side: "normal" | "zk" | "sys" };

export default function AttackModePage() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [normalStolen, setNormalStolen] = useState(false);
  const [zkRejected, setZkRejected] = useState(false);

  function push(msg: string, side: LogLine["side"]) {
    setLogs((prev) => [
      ...prev,
      { t: new Date().toISOString().slice(11, 19), msg, side },
    ]);
  }

  async function runDemo() {
    setRunning(true);
    setLogs([]);
    setNormalStolen(false);
    setZkRejected(false);

    try {
      let player = loadPlayer();
      if (!player) {
        push("creando cuenta demo…", "sys");
        player = await enrollWithPasskey();
      }

      push("jugador responde en el teléfono…", "sys");
      const { decimal: recipient } = recipientField(player.publicKey);
      const proved = await proveChest({
        answer: DEMO_CHEST.answer,
        salt: DEMO_CHEST.salt,
        playerSecret: player.playerSecret,
        chestId: String(DEMO_CHEST.id),
        recipientField: recipient,
      });
      push(`prueba lista (${Math.round(proved.timings.proveMs)}ms)`, "zk");

      // --- Cofre normal (simulado): la respuesta viaja en claro ---
      push("cofre normal: respuesta visible en el ledger", "normal");
      await sleep(400);
      push("bot copia la respuesta '42'", "normal");
      await sleep(300);
      push("bot reclama primero → PREMIO ROBADO", "normal");
      setNormalStolen(true);

      // --- ChestZK: copia la prueba, cambia la cuenta ---
      push("ChestZK: bot copia la prueba ZK", "zk");
      await sleep(300);
      const botRecipient =
        "GAVLW5IKB7VFBRJ3EHBE4BRZ5OX3AOW3ICMLMB6KVKCQDO6WJ2SPHDN3";
      push(`bot cambia receptor → ${botRecipient.slice(0, 8)}…`, "zk");

      const res = await fetch("/api/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chestId: DEMO_CHEST.id,
          botRecipient,
          nullifierHex: proved.nullifierHex,
          proof: proved.proof,
        }),
      });
      const data = await res.json();
      for (const line of data.logs || []) {
        push(String(line).replace(/^\[[^\]]+\]\s*/, ""), "zk");
      }
      if (data.rejected !== false) {
        setZkRejected(true);
        push("RECHAZADO — la prueba no es para esta cuenta", "zk");
      }
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "sys");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            Modo ataque
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            Copiar no sirve
          </h1>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={runDemo}
            disabled={running}
            className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground"
          >
            {running ? "Atacando…" : "Correr el ataque"}
          </Button>
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-full border border-border px-6 text-sm"
          >
            Inicio
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section
          className={`rounded-2xl border p-5 ${
            normalStolen ? "border-danger" : "border-border"
          } bg-card`}
        >
          <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            Cofre normal
          </p>
          <ChestVisual size="sm" className="mt-3" open={normalStolen} />
          {normalStolen && (
            <p className="mt-4 font-mono text-sm font-semibold text-danger">
              ROBADO por el bot
            </p>
          )}
        </section>

        <section
          className={`relative rounded-2xl border p-5 ${
            zkRejected ? "border-primary" : "border-border"
          } bg-card`}
        >
          <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
            ChestZK
          </p>
          <ChestVisual size="sm" className="mt-3" />
          {zkRejected && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-live="polite"
            >
              <span
                className="rotate-[-12deg] border-2 border-danger px-4 py-2 font-mono text-2xl font-bold tracking-[0.08em] text-danger"
                style={{
                  animation: running
                    ? undefined
                    : "chestzk-spin 0.3s linear 0s 3",
                }}
              >
                RECHAZADO
              </span>
            </div>
          )}
          {zkRejected && (
            <p className="mt-4 font-mono text-sm text-primary">
              la prueba no es para esta cuenta
            </p>
          )}
        </section>
      </div>

      <div className="max-h-64 overflow-auto rounded-2xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
        {logs.length === 0 && (
          <p className="text-muted-foreground">
            El log del bot aparece acá en vivo.
          </p>
        )}
        {logs.map((l, i) => (
          <p
            key={`${l.t}-${i}`}
            className={
              l.side === "normal"
                ? "text-danger"
                : l.side === "zk"
                  ? "text-primary"
                  : "text-muted-foreground"
            }
          >
            <span className="opacity-60">{l.t}</span> {l.msg}
          </p>
        ))}
      </div>
    </main>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
