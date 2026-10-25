"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChestVisual } from "@/components/chest-visual";
import { DEMO_CHEST } from "@/lib/config";
import { recipientField } from "@/lib/recipient";
import { proveChest } from "@/lib/zk";
import { loadPlayer } from "@/lib/wallet";

type Step = "calc" | "prove" | "send" | "done" | "error";

export default function ProvingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [step, setStep] = useState<Step>("calc");
  const [detail, setDetail] = useState("Calculando huella…");
  const [timings, setTimings] = useState({ calc: 0, prove: 0 });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const player = loadPlayer();
        if (!player) {
          router.replace(`/enter?next=/chest/${id}`);
          return;
        }
        const answer = sessionStorage.getItem(`chestzk.answer.${id}`);
        let salt = sessionStorage.getItem(`chestzk.salt.${id}`);
        if (!answer) {
          router.replace(`/chest/${id}`);
          return;
        }
        if (!salt) {
          const meta = await fetch(`/api/chests/${id}`).then((r) => r.json());
          salt = meta.salt || DEMO_CHEST.salt;
        }

        const { decimal: recipient } = recipientField(player.publicKey);
        setStep("calc");
        setDetail("Poseidon(respuesta, sal)…");

        setStep("prove");
        setDetail("Generando prueba Groth16…");
        const result = await proveChest({
          answer,
          salt: salt!,
          playerSecret: player.playerSecret,
          chestId: String(id),
          recipientField: recipient,
        });
        setTimings({
          calc: Math.round(result.timings.calcMs),
          prove: Math.round(result.timings.proveMs),
        });

        setStep("send");
        setDetail("Enviando a Stellar…");
        const res = await fetch("/api/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chestId: Number(id),
            recipient: player.publicKey,
            nullifierHex: result.nullifierHex,
            proof: result.proof,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || "Claim rechazado";
          if (/NullifierUsed|InvalidProof|SoldOut|Chest/i.test(JSON.stringify(data))) {
            router.replace(
              `/chest/${id}/error?reason=${encodeURIComponent(msg)}`,
            );
            return;
          }
          throw new Error(msg);
        }

        setStep("done");
        sessionStorage.setItem(
          `chestzk.claim.${id}`,
          JSON.stringify({ hash: data.hash, explorer: data.explorer }),
        );
        router.replace(`/chest/${id}/opened`);
      } catch (e) {
        setStep("error");
        setDetail(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id, router]);

  const steps: { key: Step; label: string }[] = [
    { key: "calc", label: "Calcular" },
    { key: "prove", label: "Probar" },
    { key: "send", label: "Enviar" },
  ];
  const order: Step[] = ["calc", "prove", "send", "done"];
  const idx = order.indexOf(step === "error" ? "send" : step);

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col items-center justify-center gap-8 px-6">
      <ChestVisual size="sm" />

      <div
        className={`size-16 rounded-full border-2 border-primary ${
          step !== "done" && step !== "error" ? "chestzk-spin" : ""
        }`}
        aria-hidden
      />

      <ol className="flex w-full justify-between font-mono text-xs tracking-[0.04em]">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={i <= idx ? "text-primary" : "text-muted-foreground"}
          >
            {i + 1}. {s.label}
            {s.key === "calc" && timings.calc > 0 ? ` ${timings.calc}ms` : ""}
            {s.key === "prove" && timings.prove > 0 ? ` ${timings.prove}ms` : ""}
          </li>
        ))}
      </ol>

      <p className="text-center text-sm text-muted-foreground">{detail}</p>

      {step === "error" && (
        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={() => router.push(`/chest/${id}`)}
        >
          Volver a intentar
        </button>
      )}

    </main>
  );
}
