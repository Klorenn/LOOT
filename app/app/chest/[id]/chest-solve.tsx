"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogoChest } from "@/components/logo-chest";
import { PageHeader, Em } from "@/components/app/page-header";
import { KV, Mono } from "@/components/app/kv";
import { StatusLabel } from "@/components/app/status-label";
import { DifficultyBars } from "@/components/app/difficulty-bars";
import { ExampleTag } from "@/components/app/example-tag";
import { InlineAlert } from "@/components/app/inline-alert";
import { DEMO_CHEST } from "@/lib/config";
import { getChest } from "@/lib/chests-demo";
import { useSession } from "@/lib/session";
import { PasskeyUnavailableError } from "@/lib/wallet";

export function ChestSolve({ badge }: { badge?: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const chestId = Number(id);
  const catalog = getChest(chestId);

  const { player, connect } = useSession();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    question: string;
    hint?: string;
    salt: string;
    prizeLabel: string;
    fingerprint?: string;
  } | null>(null);

  useEffect(() => {
    if (!Number.isFinite(chestId)) return;
    if (catalog && !catalog.live) {
      setMeta({
        question: catalog.question,
        salt: "7",
        prizeLabel: catalog.reward,
        fingerprint: "0x…example",
      });
      return;
    }
    fetch(`/api/chests/${chestId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Chest not found");
        return r.json();
      })
      .then((m) => {
        setMeta({
          question: m.question,
          hint: m.hint,
          salt: m.salt,
          prizeLabel: m.prizeLabel ?? "—",
          fingerprint: m.fingerprintHex,
        });
        sessionStorage.setItem(`chestzk.salt.${chestId}`, m.salt);
      })
      .catch(() => {
        if (chestId === DEMO_CHEST.id) {
          setMeta({
            question: DEMO_CHEST.question,
            hint: DEMO_CHEST.hint,
            salt: DEMO_CHEST.salt,
            prizeLabel: "—",
            fingerprint: DEMO_CHEST.fingerprintHex,
          });
          sessionStorage.setItem(`chestzk.salt.${chestId}`, DEMO_CHEST.salt);
        } else {
          setErr("Chest not found");
        }
      });
  }, [chestId, catalog]);

  const connected = !!player;
  const canProve = connected && answer.trim().length > 0;

  const titleWord = useMemo(() => {
    const n = catalog?.name || `Chest #${chestId}`;
    const parts = n.split(" ");
    return { head: parts.slice(0, -1).join(" "), last: parts.at(-1) || n };
  }, [catalog, chestId]);

  async function doConnect(method: "passkey" | "wallet" | "demo") {
    setBusy(true);
    setErr(null);
    try {
      await connect(method);
    } catch (e) {
      if (e instanceof PasskeyUnavailableError) {
        setErr("WebAuthn unavailable — connect a Stellar wallet or use a demo wallet.");
      } else {
        setErr(
          e instanceof Error
            ? e.message
            : (e as { message?: string })?.message || String(e),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function startProve() {
    if (!canProve || !meta) return;
    if (!catalog?.live && catalog) {
      setErr("example-only");
      return;
    }
    // Respuesta incorrecta: se detecta antes de probar comparando Poseidon(respuesta, sal)
    // con la huella pública del cofre (la respuesta nunca vive en el código).
    if (meta.fingerprint) {
      const { answerToField, normalizeAnswer } = await import("@/lib/answer");
      const { poseidon2, fieldToHex } = await import("@/lib/zk");
      const fp = fieldToHex(
        await poseidon2(answerToField(normalizeAnswer(answer)), BigInt(meta.salt)),
      );
      if (fp !== meta.fingerprint) {
        setErr("wrong-answer");
        return;
      }
    }
    sessionStorage.setItem(`chestzk.answer.${chestId}`, answer.trim());
    router.push(`/chest/${chestId}/proving`);
  }

  if (err === "Chest not found") {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-20">
        <InlineAlert
          tone="dim"
          title="Not found"
          body="This chest id is not on the catalogue."
          actions={[
            { href: "/explore", label: "Explore chests", primary: true },
            { href: `/chest/${DEMO_CHEST.id}`, label: "Open demo chest" },
          ]}
        />
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/explore" className="hover:text-[var(--text)]">
              Explore
            </Link>
            {" / "}#{String(chestId).padStart(4, "0")}
            {!catalog?.live && (
              <>
                {" · "}
                <ExampleTag />
              </>
            )}
          </span>
        }
        title={
          <>
            {titleWord.head ? `${titleWord.head} ` : ""}
            <Em>{titleWord.last}</Em>
          </>
        }
        lead={
          meta ? (
            <span className="italic">&ldquo;{meta.question}&rdquo;</span>
          ) : (
            "Loading…"
          )
        }
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1fr_1.15fr] lg:gap-[72px]">
        <div>
          <LogoChest className="w-[200px] lg:w-[240px]" />
          {meta && (
            <div className="mt-10">
              <KV
                rows={[
                  {
                    label: "Reward",
                    value: meta.prizeLabel,
                    valueClass: "text-[var(--gold)]",
                  },
                  {
                    label: "Difficulty",
                    value: (
                      <DifficultyBars
                        level={catalog?.difficulty ?? 1}
                      />
                    ),
                  },
                  {
                    label: "Status",
                    value: (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <StatusLabel status={catalog?.status ?? "open"} />
                        {catalog?.expires && catalog.expires !== "—" && (
                          <span className="text-[var(--dim)]">
                            expires in {catalog.expires}
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    label: "Answer hash",
                    value: (
                      <span>
                        poseidon →{" "}
                        <Mono>
                          {meta.fingerprint || DEMO_CHEST.fingerprintHex}
                        </Mono>
                      </span>
                    ),
                  },
                  {
                    label: "Circuit",
                    value: "chest_v1.circom · Groth16 · BN254",
                  },
                ]}
              />
            </div>
          )}
          <div className="mt-6">{badge}</div>
        </div>

        <div className="flex flex-col gap-4">
          {/* 01 Connect */}
          <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <span className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                01 · Connect
              </span>
              <span className="font-mono text-[12px]">
                {connected ? (
                  <span className="inline-flex items-center gap-2 text-[var(--ok)]">
                    <span className="size-[6px] rounded-full bg-[var(--ok)]" />
                    <Mono>{player!.publicKey}</Mono>
                  </span>
                ) : (
                  <span className="text-[var(--dim)]">not connected</span>
                )}
              </span>
            </header>
            <div className="space-y-4 p-5">
              <p className="text-[15px] leading-[1.5] text-[var(--muted)]">
                Your address becomes a public input of the proof. Only it can
                claim.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || connected}
                  onClick={() => void doConnect("passkey")}
                  className="btn-landing btn-landing-p"
                >
                  Continue with passkey
                </button>
                <button
                  type="button"
                  disabled={busy || connected}
                  onClick={() => void doConnect("wallet")}
                  className="btn-landing btn-landing-s"
                >
                  Connect Stellar wallet
                </button>
                <button
                  type="button"
                  disabled={busy || connected}
                  onClick={() => void doConnect("demo")}
                  className="btn-landing btn-landing-s"
                >
                  Demo wallet
                </button>
              </div>
              <p className="font-mono text-[12px] text-[var(--dim)]">
                Passkey smart account. Gas is paid by the relayer — you
                need 0 XLM.
              </p>
            </div>
          </section>

          {/* 02 Answer */}
          <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <span className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                02 · Your answer
              </span>
              <span className="font-mono text-[12px] text-[var(--dim)]">
                stays on this device
              </span>
            </header>
            <div className="space-y-3 p-5">
              <label className="block font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">
                {meta?.hint || "Answer"}
              </label>
              <input
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  if (err === "wrong-answer") setErr(null);
                }}
                className="h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3 font-mono text-[15px] outline-none focus:border-[var(--proof)]"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="font-mono text-[12px] text-[var(--dim)]">
                Normalized on this device. Never sent to any server.
              </p>
            </div>
          </section>

          {/* 03 Prove */}
          <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <span className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                03 · Prove & claim
              </span>
              <span className="font-mono text-[12px] text-[var(--dim)]">
                ~4 s in browser
              </span>
            </header>
            <div className="p-5">
              {err === "wrong-answer" ? (
                <div className="space-y-4">
                  <InlineAlert
                    tone="red"
                    title="Wrong answer"
                    body="That answer doesn't open this chest. Hash mismatch — nothing was sent on-chain."
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-landing btn-landing-p"
                      onClick={() => {
                        setErr(null);
                        setAnswer("");
                      }}
                    >
                      Try again
                    </button>
                    <Link href="/explore" className="btn-landing btn-landing-s">
                      Back to chests
                    </Link>
                  </div>
                </div>
              ) : err === "example-only" ? (
                <InlineAlert
                  tone="gold"
                  title="Example chest"
                  body="This row is sample data. Open the live demo chest to try a real claim."
                  actions={[
                    {
                      href: `/chest/${DEMO_CHEST.id}`,
                      label: "Open live demo",
                      primary: true,
                    },
                  ]}
                />
              ) : err && err !== "wrong-answer" ? (
                <InlineAlert tone="red" title="Error" body={err} />
              ) : (
                <>
                  <ol className="space-y-2 font-mono text-[13px] text-[var(--muted)]">
                    {[
                      "Load circuit + zkey",
                      "Compute witness (answer, address)",
                      "Generate Groth16 proof",
                      "Submit to Soroban via relayer",
                    ].map((s, i) => (
                      <li
                        key={s}
                        className="flex justify-between border-b border-[var(--line)] py-2"
                      >
                        <span>
                          {String.fromCharCode(97 + i)}. {s}
                        </span>
                        <span className="text-[var(--dim)]">—</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 h-1 overflow-hidden rounded-sm bg-[var(--line)]">
                    <div className="h-full w-0 bg-[var(--proof)]" />
                  </div>
                  <button
                    type="button"
                    disabled={!canProve || busy}
                    onClick={() => void startProve()}
                    className="btn-landing btn-landing-p mt-5 w-full disabled:opacity-40"
                  >
                    Generate proof and claim
                  </button>
                  <p className="mt-3 font-mono text-[12px] text-[var(--dim)]">
                    {canProve
                      ? `Proof binds: answer hash + ${player!.publicKey.slice(0, 4)}… + chest #${chestId} nullifier.`
                      : "Connect and enter an answer to continue."}
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
