"use client";

import { useCallback, useState } from "react";
import { PageHeader, Em } from "@/components/page-header";
import { ExampleTag } from "@/components/example-tag";
import { Terminal } from "@/components/terminal";
import { ATTACK_CHEST, NETWORK } from "@/lib/config";
import { loadPlayer, enrollPreferPasskey } from "@/lib/wallet";
import { recipientField } from "@/lib/recipient";
import { proveChest } from "@/lib/zk";

type Side = "you" | "bot" | "sys";
type LogLine = { t: string; msg: string; side: Side };

/** Cuenta que hace de bot (la del relayer en testnet): destino al que se re-apunta la prueba copiada. */
const BOT_ADDR = "GAVLW5IKB7VFBRJ3EHBE4BRZ5OX3AOW3ICMLMB6KVKCQDO6WJ2SPHDN3";
const BOT_SHORT = `${BOT_ADDR.slice(0, 4)}…${BOT_ADDR.slice(-4)}`;

const EXPLORER_TX = `${NETWORK.explorerUrl}/tx/`;

export function AttackClient({
  zkBadge,
  normalBadge,
}: {
  zkBadge?: React.ReactNode;
  normalBadge?: React.ReactNode;
}) {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [youStatus, setYouStatus] = useState("idle");
  const [botStatus, setBotStatus] = useState("idle");
  const [youBorder, setYouBorder] = useState<"line" | "ok" | "proof">("line");
  const [botBorder, setBotBorder] = useState<"line" | "red">("line");
  const [youAddr, setYouAddr] = useState("not connected");

  const push = useCallback((msg: string, side: Side) => {
    setLogs((prev) => [
      ...prev,
      { t: new Date().toISOString().slice(11, 19), msg, side },
    ]);
  }, []);

  const reset = useCallback(() => {
    setLogs([]);
    setRunning(false);
    setYouStatus("idle");
    setBotStatus("idle");
    setYouBorder("line");
    setBotBorder("line");
  }, []);

  const runDemo = useCallback(async () => {
    setRunning(true);
    setLogs([]);
    setYouStatus("computing…");
    setBotStatus("watching mempool");
    setYouBorder("proof");
    setBotBorder("line");

    try {
      let player = loadPlayer();
      if (!player) {
        push("creating demo account…", "sys");
        player = await enrollPreferPasskey();
      }
      const short = `${player.publicKey.slice(0, 4)}…${player.publicKey.slice(-4)}`;
      setYouAddr(short);

      push("compute witness (answer, address)…", "you");
      const { decimal: recipient } = recipientField(player.publicKey);
      // Nullifier descartable: la demo nunca cobra por vos, así que no debe quemar el
      // nullifier real de tu cuenta (si ya cobraste este cofre, el contrato cortaría con #5).
      const rnd = crypto.getRandomValues(new Uint8Array(31));
      const demoSecret = BigInt(
        "0x" + [...rnd].map((b) => b.toString(16).padStart(2, "0")).join(""),
      ).toString();
      const proved = await proveChest({
        answer: ATTACK_CHEST.answer,
        salt: ATTACK_CHEST.salt,
        playerSecret: demoSecret,
        chestId: String(ATTACK_CHEST.id),
        recipientField: recipient,
      });
      push(`π generated (${Math.round(proved.timings.proveMs)}ms)`, "you");
      setYouStatus("submitting…");
      push("submit via relayer…", "you");

      // Normal chest front-run (real testnet) — shown on bot side as context
      push("bot sees plain-text answer on the plain chest…", "bot");
      try {
        const nres = await fetch("/api/attack/normal", { method: "POST" });
        const ndata = await nres.json();
        for (const line of ndata.logs || []) {
          push(String(line).replace(/^\[[^\]]+\]\s*/, ""), "bot");
        }
        if (nres.ok && !ndata.error) {
          push("plain chest: prize stolen", "bot");
        }
      } catch {
        /* non-fatal for ZK half */
      }

      push(`bot copies π and re-points it to ${BOT_SHORT}`, "bot");
      setBotStatus("resubmitting…");
      const botRecipient = BOT_ADDR;

      const res = await fetch("/api/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chestId: ATTACK_CHEST.id,
          botRecipient,
          nullifierHex: proved.nullifierHex,
          proof: proved.proof,
        }),
      });
      const data = await res.json();
      for (const line of data.logs || []) {
        push(String(line).replace(/^\[[^\]]+\]\s*/, ""), "bot");
      }

      if (data.rejected === true) {
        push(`REJECTED proof bound to ${short}, not ${BOT_SHORT}`, "bot");
        push("reverted · nothing was paid out", "bot");
        setBotStatus("rejected");
        setBotBorder("red");
        // La demo no envía ningún claim del jugador: solo prueba que el cambio de receptor falla.
        push("your proof is valid for your address (not submitted in this demo)", "you");
        setYouStatus("proof valid · not submitted");
        setYouBorder("ok");
      } else if (typeof data.envError === "string" || !res.ok) {
        const envMsg = String(
          data.envError ?? data.error ?? `HTTP ${res.status}`,
        ).slice(0, 160);
        push(`env: ${envMsg}`, "sys");
        setBotStatus("error");
        setYouStatus("error");
      }
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), "sys");
      setYouStatus("error");
      setBotStatus("idle");
    } finally {
      setRunning(false);
    }
  }, [push]);

  const youLines = logs.filter((l) => l.side === "you" || l.side === "sys");
  const botLines = logs.filter((l) => l.side === "bot");

  return (
    <main>
      <PageHeader
        tint="red"
        eyebrow={
          <span className="inline-flex items-center gap-2 text-[var(--red)]">
            <span className="size-[6px] rounded-full bg-[var(--red)]" />
            Live demo · testnet
          </span>
        }
        title={
          <>
            <span className="lg:whitespace-nowrap">Copy the proof. <Em tone="red">Lose anyway.</Em></span>
          </>
        }
        lead="A bot watches the mempool, copies your proof and resends it with a higher fee. The proof is bound to your address: if a bot copies it and changes the recipient, the contract rejects it. And each proof works only once."
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runDemo()}
              disabled={running}
              className="btn-landing btn-landing-p"
            >
              {running ? "Running…" : "Run the attack"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="btn-landing btn-landing-s"
            >
              Reset
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="grid gap-4 md:grid-cols-2">
          <Terminal
            tone="proof"
            borderTone={youBorder}
            label={`You · ${youAddr}`}
            status={youStatus}
            lines={youLines}
          />
          <Terminal
            tone="red"
            borderTone={botBorder}
            label={`Bot · ${BOT_SHORT}`}
            status={botStatus}
            lines={botLines}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[12px] text-[var(--dim)]">
          <span className="inline-flex flex-wrap items-center gap-3">
            ZK chest contract {zkBadge}
          </span>
          <span className="inline-flex flex-wrap items-center gap-3">
            Normal chest contract {normalBadge}
          </span>
        </div>

        <div className="mt-10 grid grid-cols-1 border border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              k: "Public input",
              v: "Your address is bound into π",
              c: "text-[var(--proof)]",
            },
            {
              k: "Nullifier",
              v: "Each proof works once · replays revert",
              c: "text-[var(--red)]",
            },
            {
              k: "Soroban",
              v: "BN254 host fns · Protocol 25/26",
              c: "text-[var(--ok)]",
            },
            {
              k: "Prize",
              v: "Paid only to the address inside the proof",
              c: "text-[var(--gold)]",
            },
          ].map((cell, i) => (
            <div
              key={cell.k}
              className={`p-5 ${i ? "border-[var(--line)] sm:border-l" : ""} ${
                i > 1 ? "border-t lg:border-t-0" : ""
              } border-[var(--line)]`}
            >
              <p className={`font-mono text-[12px] tracking-[0.06em] uppercase ${cell.c}`}>
                {cell.k}
              </p>
              <p className="mt-2 text-[14px] leading-[1.45] text-[var(--muted)]">
                {cell.v}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <ExampleTag>scripted bot account · real testnet calls</ExampleTag>
        </div>
        <p className="mt-6 font-mono text-[12px] text-[var(--dim)]">
          Live txs →{" "}
          <a
            href={EXPLORER_TX}
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Stellar Expert testnet
          </a>
        </p>
      </div>
    </main>
  );
}
