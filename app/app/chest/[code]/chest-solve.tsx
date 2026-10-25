"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CellsCanvas } from "@/components/cells-canvas";
import { LogoChest } from "@/components/logo-chest";
import { StateBlock } from "@/components/state-block";
import { PageHeader, Em } from "@/components/page-header";
import { KV, Mono } from "@/components/kv";
import { StatusLabel } from "@/components/status-label";
import { DifficultyBars } from "@/components/difficulty-bars";
import { ExampleTag } from "@/components/example-tag";
import { InlineAlert } from "@/components/inline-alert";
import { chestPath } from "@/lib/chest-code";
import { DEMO_CHEST, PRIZE, ZK_ASSETS } from "@/lib/config";
import { getChest } from "@/lib/chests-demo";
import { recipientField } from "@/lib/recipient";
import { useSession } from "@/lib/session";
import { PasskeyUnavailableError } from "@/lib/wallet";

type Meta = {
  question: string;
  hint?: string;
  /** ausente en cofres privados: viaja en el #s= del link */
  salt?: string;
  saltRequired?: boolean;
  difficulty?: 1 | 2 | 3 | 4;
  prizeLabel: string;
  fingerprint?: string;
  creator?: string;
  deadline?: number;
  claims?: number;
  maxClaims?: number;
  closed?: boolean;
};

type StepState = "idle" | "run" | "done";

/** Panel 03: qué mostrar cuando algo sale mal (inline, reemplaza el cuerpo del panel). */
type Fail =
  | { kind: "wrong" }
  | { kind: "used" }
  | { kind: "soldout" }
  | { kind: "closed" }
  | { kind: "invalid" }
  | { kind: "browser"; detail: string }
  | { kind: "relayer"; detail: string }
  | { kind: "example" };

/** Contrato (contracts/chest/src/lib.rs): 1 NotFound, 2 Closed, 3 Expired, 4 SoldOut, 5 NullifierUsed, 6 InvalidProof. */
function classify(raw: string): Fail {
  const n = raw.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];
  if (n === "5") return { kind: "used" };
  if (n === "4") return { kind: "soldout" };
  if (n === "1" || n === "2" || n === "3") return { kind: "closed" };
  if (n === "6") return { kind: "invalid" };
  return { kind: "relayer", detail: raw.slice(0, 400) };
}

const STEPS = [
  "Load circuit + zkey",
  "Compute witness (answer, address)",
  "Generate Groth16 proof",
  "Submit to Soroban via relayer",
];

function expiresIn(deadline?: number) {
  if (!deadline) return null;
  const s = deadline - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `expires in ${d ? `${d}d ` : ""}${h}h`;
}

export function ChestSolve({
  chestId,
  badge,
}: {
  chestId: number;
  badge?: React.ReactNode;
}) {
  const router = useRouter();
  const catalog = getChest(chestId);

  const { player, connect } = useSession();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [steps, setSteps] = useState<StepState[]>(["idle", "idle", "idle", "idle"]);
  const [running, setRunning] = useState(false);
  const [fail, setFail] = useState<Fail | null>(null);
  // Cofre privado: la sal vive solo en el fragmento de la URL (nunca llega al servidor).
  const [fragSalt, setFragSalt] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/[#&]s=(\d{1,80})(?:&|$)/);
      setFragSalt(m ? m[1] : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

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
      .then((m) =>
        setMeta({
          question: m.question,
          hint: m.hint,
          salt: m.salt,
          saltRequired: m.saltRequired,
          difficulty: m.difficulty,
          prizeLabel: m.prizeLabel ?? "—",
          fingerprint: m.fingerprintHex,
          creator: m.creator,
          deadline: m.deadline,
          claims: m.claims,
          maxClaims: m.maxClaims,
          closed: m.closed,
        }),
      )
      .catch(() => {
        if (chestId === DEMO_CHEST.id) {
          setMeta({
            question: DEMO_CHEST.question,
            hint: DEMO_CHEST.hint,
            salt: DEMO_CHEST.salt,
            prizeLabel: "—",
            fingerprint: DEMO_CHEST.fingerprintHex,
          });
        } else setNotFound(true);
      });
  }, [chestId, catalog]);

  const salt = meta?.salt ?? fragSalt ?? undefined;
  const needsInvite = !!meta?.saltRequired && !fragSalt;
  const connected = !!player;
  const canProve = connected && answer.trim().length > 0 && !running && !needsInvite;

  const titleWord = useMemo(() => {
    const n = catalog?.name || `Chest #${chestId}`;
    const parts = n.split(" ");
    return { head: parts.slice(0, -1).join(" "), last: parts.at(-1) || n };
  }, [catalog, chestId]);

  const status = useMemo(() => {
    if (!meta) return "open" as const;
    if (catalog && !catalog.live) return catalog.status;
    const expired = meta.deadline && meta.deadline * 1000 < Date.now();
    if (expired) return "expired" as const;
    if (meta.closed || (meta.maxClaims && (meta.claims ?? 0) >= meta.maxClaims))
      return "claimed" as const;
    return "open" as const;
  }, [meta, catalog]);

  async function doConnect(method: "passkey" | "wallet" | "demo") {
    setBusy(true);
    setConnectErr(null);
    try {
      await connect(method);
    } catch (e) {
      if ((e as { name?: string })?.name === "WalletPickerClosed") return;
      setConnectErr(
        e instanceof PasskeyUnavailableError
          ? "WebAuthn unavailable — connect a Stellar wallet or use a demo wallet."
          : e instanceof Error
            ? e.message
            : (e as { message?: string })?.message || String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  const mark = (i: number, s: StepState) =>
    setSteps((prev) => prev.map((v, j) => (j === i ? s : v)));

  async function prove() {
    if (!canProve || !meta || !player || !salt) return;
    setFail(null);
    if (!catalog?.live && catalog) {
      setFail({ kind: "example" });
      return;
    }
    const secretAnswer = answer;
    setRunning(true);
    setSteps(["idle", "idle", "idle", "idle"]);
    try {
      // Respuesta incorrecta: se detecta antes de probar comparando Poseidon(respuesta, sal)
      // con la huella pública (la respuesta nunca vive en el código ni sale del dispositivo).
      const { answerToField, normalizeAnswer } = await import("@/lib/answer");
      const { poseidon2, fieldToHex, proveChest } = await import("@/lib/zk");
      if (meta.fingerprint) {
        const fp = fieldToHex(
          await poseidon2(
            answerToField(normalizeAnswer(secretAnswer)),
            BigInt(salt ?? "0"),
          ),
        );
        if (fp !== meta.fingerprint) {
          setFail({ kind: "wrong" });
          return;
        }
      }

      mark(0, "run");
      await Promise.all([fetch(ZK_ASSETS.wasm), fetch(ZK_ASSETS.zkey)]);
      mark(0, "done");

      const { decimal: recipient } = recipientField(player.publicKey);
      let result;
      try {
        result = await proveChest({
          answer: secretAnswer,
          salt: salt ?? "0",
          playerSecret: player.playerSecret,
          chestId: String(chestId),
          recipientField: recipient,
          onStage: (stage) => {
            if (stage === "witness") mark(1, "run");
            else {
              mark(1, "done");
              mark(2, "run");
            }
          },
        });
      } catch (e) {
        setFail({
          kind: "browser",
          detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
        return;
      }
      mark(2, "done");

      mark(3, "run");
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chestId,
          recipient: player.publicKey,
          nullifierHex: result.nullifierHex,
          proof: result.proof,
        }),
      }).catch((e) => {
        throw new Error(`network: ${e instanceof Error ? e.message : String(e)}`);
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFail(classify(String(data.error || `HTTP ${res.status}`)));
        return;
      }
      mark(3, "done");
      sessionStorage.setItem(
        `chestzk.claim.${chestId}`,
        JSON.stringify({
          hash: data.hash,
          explorer: data.explorer,
          nullifierHex: result.nullifierHex,
          ledger: data.ledger,
        }),
      );
      // la wallet (si está abierta) refresca saldo e historial
      window.dispatchEvent(new Event("chestzk:claimed"));
      router.push(`${chestPath(chestId)}/claimed`);
    } catch (e) {
      setFail({
        kind: "relayer",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-20">
        <InlineAlert
          tone="dim"
          title="Not found"
          body="This chest id is not on the catalogue."
          actions={[
            { href: chestPath(DEMO_CHEST.id), label: "Open the demo chest", primary: true },
          ]}
        />
      </main>
    );
  }

  const done = steps.filter((s) => s === "done").length;
  const runningIdx = steps.findIndex((s) => s === "run");
  const progress = ((done + (runningIdx >= 0 ? 0.5 : 0)) / 4) * 100;

  const failView = fail && (
    <FailBlock
      fail={fail}
      chestId={chestId}
      onRetry={() => {
        setFail(null);
        setSteps(["idle", "idle", "idle", "idle"]);
      }}
    />
  );

  return (
    <main>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/explore" className="hover:text-[var(--text)]">
              Explore
            </Link>
            {" / "}#{String(chestId).padStart(4, "0")}
            {!catalog?.live && catalog && (
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

      <div className="relative">
        {/* Celdas solo en los 300px de abajo, detrás del contenido */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] opacity-70"
          style={{
            WebkitMaskImage: "linear-gradient(to top, #000, transparent)",
            maskImage: "linear-gradient(to top, #000, transparent)",
          }}
        >
          <CellsCanvas cx={0.3} />
        </div>

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1fr_1.15fr] lg:gap-[72px]">
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
                      value: <DifficultyBars level={catalog?.difficulty ?? meta?.difficulty ?? 1} />,
                    },
                    {
                      label: "Status",
                      value: (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <StatusLabel status={status} />
                          {expiresIn(meta.deadline) && (
                            <span className="text-[var(--dim)]">
                              {expiresIn(meta.deadline)}
                            </span>
                          )}
                        </span>
                      ),
                    },
                    ...(meta.maxClaims
                      ? [
                          {
                            label: "Slots",
                            value: `${meta.claims ?? 0} / ${meta.maxClaims} claimed`,
                          },
                        ]
                      : []),
                    ...(meta.creator
                      ? [{ label: "Creator", value: <Mono>{meta.creator}</Mono> }]
                      : []),
                    {
                      label: "Answer hash",
                      value: (
                        <span>
                          poseidon →{" "}
                          <Mono>{meta.fingerprint || DEMO_CHEST.fingerprintHex}</Mono>
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
            <Panel
              step="01 · Connect"
              right={
                connected ? (
                  <span className="inline-flex items-center gap-2 text-[var(--ok)]">
                    <span className="size-[6px] rounded-full bg-[var(--ok)]" />
                    <Mono>{player!.publicKey}</Mono>
                  </span>
                ) : (
                  <span className="text-[var(--dim)]">not connected</span>
                )
              }
            >
              {connected ? (
                <p className="text-[15px] leading-[1.5] text-[var(--muted)]">
                  Connected. The prize goes to this address.
                </p>
              ) : (
                <>
                  <p className="text-[15px] leading-[1.5] text-[var(--muted)]">
                    The prize goes to the address you connect.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doConnect("passkey")}
                      className="btn-landing btn-landing-p disabled:opacity-40"
                    >
                      Continue with passkey
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doConnect("wallet")}
                      className="btn-landing btn-landing-s disabled:opacity-40"
                    >
                      Connect a wallet
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void doConnect("demo")}
                    className="mt-3 font-mono text-[12px] text-[var(--dim)] underline underline-offset-2 hover:text-[var(--text)]"
                  >
                    or use a throwaway demo wallet
                  </button>
                  <p className="mt-3 font-mono text-[12px] text-[var(--dim)]">
                    No gas needed: the relayer pays. You need 0 {PRIZE.code}.
                  </p>
                </>
              )}
              {connectErr && (
                <p className="mt-3 text-[13px] text-[var(--red)]" role="alert">
                  {connectErr}
                </p>
              )}
            </Panel>

            <Panel
              step="02 · Your answer"
              right={<span className="text-[var(--dim)]">stays on this device</span>}
            >
              <label htmlFor="answer" className="block text-[15px] font-medium">
                {meta?.hint || "Answer"}
              </label>
              <input
                id="answer"
                value={answer}
                disabled={running}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  if (fail?.kind === "wrong") setFail(null);
                }}
                placeholder="type your answer"
                className="mt-3 h-11 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-3.5 font-mono text-[15px] outline-none placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)]"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-3 font-mono text-[12px] text-[var(--dim)]">
                Normalized on this device. Never sent to any server.
              </p>
              {needsInvite && (
                <p className="mt-3 text-[13px] text-[var(--gold)]" role="alert">
                  This chest needs its full invite link. Ask the creator for the link that ends in
                  #s=…; without it nobody can build a proof.
                </p>
              )}
            </Panel>

            <Panel
              step="03 · Prove & claim"
              right={<span className="text-[var(--dim)]">~4 s in browser</span>}
            >
              {failView ?? (
                <>
                  <ol>
                    {STEPS.map((s, i) => (
                      <li
                        key={s}
                        className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-[var(--line)] py-3 text-[14px]"
                      >
                        <span className="font-mono text-[12px] text-[var(--dim)]">
                          {String.fromCharCode(97 + i)}
                        </span>
                        <span className="text-[var(--text)]">{s}</span>
                        <span
                          className="font-mono text-[12px]"
                          style={{
                            color:
                              steps[i] === "done"
                                ? "var(--ok)"
                                : steps[i] === "run"
                                  ? "var(--proof)"
                                  : "var(--dim)",
                          }}
                        >
                          {steps[i] === "done"
                            ? "done"
                            : steps[i] === "run"
                              ? "running…"
                              : "—"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 h-1 overflow-hidden rounded-sm bg-[var(--line)]">
                    <div
                      className="h-full bg-[var(--proof)] transition-[width] duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!canProve}
                    onClick={() => void prove()}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[var(--proof)] text-[15px] font-semibold text-[var(--bg)] outline-none transition-opacity focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--proof)] disabled:opacity-40"
                  >
                    {running ? "Working…" : "Generate proof and claim"}
                  </button>
                  <p className="mt-3 font-mono text-[12px] text-[var(--dim)]">
                    {connected && answer.trim()
                      ? `Proof binds: answer hash + ${player!.publicKey.slice(0, 4)}…${player!.publicKey.slice(-4)} + chest #${String(chestId).padStart(4, "0")}.`
                      : "Connect and enter an answer to continue."}
                  </p>
                </>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}

function Panel({
  step,
  right,
  children,
}: {
  step: string;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <h2 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
          {step}
        </h2>
        <span className="font-mono text-[12px] tracking-[0.06em] uppercase">
          {right}
        </span>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FailBlock({
  fail,
  chestId,
  onRetry,
}: {
  fail: Fail;
  chestId: number;
  onRetry: () => void;
}) {
  const retry = { label: "Try again", onClick: onRetry, primary: true } as const;
  const back = { label: "Back to chests", href: "/explore" } as const;
  switch (fail.kind) {
    case "wrong":
      return (
        <StateBlock
          tone="red"
          label="Wrong answer"
          title="That answer doesn’t open this chest."
          body="Its hash doesn’t match this chest’s answer hash. Nothing was sent on-chain and no attempt was used."
          chest="none"
          actions={[retry, back]}
        />
      );
    case "used":
      return (
        <StateBlock
          tone="proof"
          label="Proof already used"
          title="This proof was already spent."
          body="This account’s nullifier is already stored on this chest. Each proof works once and only pays the address it was made for."
          chest="none"
          actions={[
            { href: chestPath(DEMO_CHEST.id), label: "Open the demo chest", primary: true },
            { href: "/claimed-chests", label: "My claimed chests" },
          ]}
        />
      );
    case "soldout":
      return (
        <StateBlock
          tone="dim"
          label="Sold out"
          title="Every slot is claimed."
          body="All prizes in this chest have been paid out."
          chest="none"
          actions={[{ href: chestPath(DEMO_CHEST.id), label: "Open the demo chest", primary: true }]}
        />
      );
    case "closed":
      return (
        <StateBlock
          tone="dim"
          label="Not available"
          title="This chest is closed or expired."
          body="The creator closed it, its deadline passed, or it doesn’t exist on the network."
          chest="none"
          actions={[{ href: chestPath(DEMO_CHEST.id), label: "Open the demo chest", primary: true }]}
        />
      );
    case "invalid":
      return (
        <StateBlock
          tone="red"
          label="Proof rejected"
          title="The contract rejected the proof."
          body="Soroban could not verify it for your address. Your answer is still only on this device."
          chest="none"
          actions={[retry, back]}
        />
      );
    case "browser":
      return (
        <StateBlock
          tone="red"
          label="Proof failed"
          title="Your browser couldn’t finish the proof."
          body={
            <>
              The proof stopped before anything was sent. Close other tabs and
              retry, or use a desktop browser. Your answer is still only on this
              device.
              <span className="mt-2 block font-mono text-[12px] break-words text-[var(--dim)]">
                {fail.detail.slice(0, 200)}
              </span>
            </>
          }
          chest="none"
          actions={[
            { label: "Retry proof", onClick: onRetry, primary: true },
            {
              label: "Copy error log",
              onClick: () => void navigator.clipboard?.writeText(fail.detail),
            },
          ]}
        />
      );
    case "relayer":
      return (
        <StateBlock
          tone="gold"
          label="Claim not confirmed"
          title="The claim didn’t go through."
          body={
            <>
              The relayer or the network didn’t confirm it. Nothing was spent from
              your account; try again in a moment.
              <span className="mt-2 block font-mono text-[12px] break-words text-[var(--dim)]">
                {fail.detail.slice(0, 200)}
              </span>
            </>
          }
          chest="none"
          actions={[
            { label: "Retry", onClick: onRetry, primary: true },
            { href: chestPath(chestId), label: "Reload chest" },
          ]}
        />
      );
    case "example":
      return (
        <StateBlock
          tone="gold"
          label="Example chest"
          title="This row is sample data."
          body="Open the live demo chest to try a real claim."
          chest="none"
          actions={[
            { href: chestPath(DEMO_CHEST.id), label: "Open live demo", primary: true },
          ]}
        />
      );
  }
}
