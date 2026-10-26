"use client";

import { SponsorNotice } from "@/components/sponsor-notice";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Wallet as WalletIcon } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { IconSmartAccountKit as PasskeyGlyph } from "@/components/stack-logos";
import { InlineAlert } from "@/components/inline-alert";
import { chestPath } from "@/lib/chest-code";
import { shortAddr } from "@/lib/format";
import { HANDLE_HINT, HANDLE_RE, setHandle } from "@/lib/handle";
import { safeNext } from "@/lib/safe-next";
import { useSession } from "@/lib/session";
import {
  NoPasskeyAccountError,
  PasskeyUnavailableError,
  type EnrollOpts,
} from "@/lib/wallet";
import { useNet } from "@/components/network-provider";
import { MAINNET_PASSKEY_NOTE } from "@/lib/passkey-policy";
import { FreighterGlyph } from "@/components/freighter-glyph";

type Mode = "login" | "register";
type View = "idle" | "wait" | "deploy" | "done" | "fail" | "none";
type FailKind = "passkey" | "relayer" | "unsupported" | "wallet" | "unavailable";

const STEPS = [
  "Passkey created · this device",
  "Address derived",
  "Deploy smart account",
  "Confirm on ledger",
] as const;

const errName = (e: unknown) => (e as { name?: string })?.name ?? "";
const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e));

/** Cancelado / sin permiso del usuario en el prompt WebAuthn. */
const isCancel = (e: unknown) =>
  /NotAllowedError|AbortError/i.test(errName(e)) ||
  /NotAllowedError|AbortError|timed out or was not allowed|cancel/i.test(errMsg(e));

export function AuthForm({ mode }: { mode: Mode }) {
  const { SAMPLE_CHEST_ID, NETWORK_LC, IS_MAINNET, PASSKEY_ENABLED } = useNet();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const next = safeNext(rawNext);
  const { connect, disconnect, address, ready } = useSession();

  const [view, setView] = useState<View>("idle");
  const [failKind, setFailKind] = useState<FailKind>("passkey");
  const [failDetail, setFailDetail] = useState("");
  const [handle, setHandleText] = useState("");
  const [handleErr, setHandleErr] = useState<string | null>(null);
  const [stage, setStage] = useState(0); // 0 espera, 1..4 pasos hechos
  const [derived, setDerived] = useState<string | null>(null);
  const [doneAddr, setDoneAddr] = useState<string | null>(null);
  const [doneHandle, setDoneHandle] = useState<string>("");
  const token = useRef(0);

  // Con sesión ya activa al entrar no tiene sentido mostrar el formulario. Solo se mira una vez
  // (si no, el login recién hecho saltaría la pantalla "done" del registro).
  const checked = useRef(false);
  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    if (address) router.replace(next ?? "/profile");
  }, [ready, address, next, router]);

  const q = rawNext && next ? `?next=${encodeURIComponent(next)}` : "";
  const isLogin = mode === "login";

  function fail(e: unknown, wallet = false) {
    if (errName(e) === "WalletPickerClosed") return; // cerró el selector: no es un error
    console.warn("auth error:", errName(e), errMsg(e));
    setFailDetail(errMsg(e).slice(0, 200));
    if (wallet) {
      setFailKind("wallet");
      setView("fail");
    } else if (e instanceof PasskeyUnavailableError) {
      setFailKind("unsupported");
      setView("fail");
    } else if (isCancel(e)) {
      setFailKind("passkey");
      setView("fail");
    } else if (e instanceof NoPasskeyAccountError) {
      setView("none");
    } else if (/signup is temporarily unavailable/i.test(errMsg(e))) {
      setFailKind("unavailable");
      setView("fail");
    } else if (/passkey submit|relay|HTTP 5|fetch failed|network|wasn.t created yet/i.test(errMsg(e))) {
      setFailKind("relayer");
      setView("fail");
    } else {
      setFailKind("passkey");
      setView("fail");
    }
  }

  const handleValid = HANDLE_RE.test(handle.trim().toLowerCase());

  /** null = vacío (solo permitido con wallet: se pregunta después de conectar), false = inválido. */
  function validHandle(required = false): string | null | false {
    const h = handle.trim().toLowerCase();
    if (!h) {
      if (!required) return null;
      setHandleErr(HANDLE_HINT);
      return false;
    }
    if (!HANDLE_RE.test(h)) {
      setHandleErr(HANDLE_HINT);
      return false;
    }
    return h;
  }

  async function finishLogin() {
    router.replace(next ?? "/profile");
  }

  async function withPasskey() {
    const mine = ++token.current;
    setFailDetail("");
    if (isLogin) {
      setView("wait");
      try {
        await connect("passkey-existing");
        if (mine !== token.current) return void disconnect(); // cancelado mientras tanto
        await finishLogin();
      } catch (e) {
        if (mine === token.current) fail(e);
      }
      return;
    }
    const h = validHandle(true);
    if (h === false) return;
    setHandleErr(null);
    setStage(0);
    setDerived(null);
    setView("wait");
    const onStage: EnrollOpts["onStage"] = (s, info) => {
      if (mine !== token.current) return;
      if (s === "passkey") {
        setDerived(info?.address ?? null);
        setStage(2);
        setView("deploy");
      } else if (s === "deploy") setStage(2);
      else if (s === "confirm") setStage(3);
    };
    try {
      const player = await connect("passkey-new", onStage);
      if (mine !== token.current) return void disconnect();
      if (h) setHandle(player.publicKey, h);
      setDoneHandle(h || "");
      setDoneAddr(player.publicKey);
      setStage(4);
      setView("done");
    } catch (e) {
      if (mine === token.current) fail(e);
    }
  }

  /** "freighter": directo; "wallet": selector de Stellar Wallets Kit. */
  async function withWallet(method: "freighter" | "wallet") {
    const mine = ++token.current;
    setFailDetail("");
    const h = isLogin ? null : validHandle();
    if (h === false) return;
    setHandleErr(null);
    try {
      const player = await connect(method);
      if (mine !== token.current) return void disconnect();
      if (isLogin) return void (await finishLogin());
      if (h) setHandle(player.publicKey, h);
      setDoneHandle(h || "");
      setDoneAddr(player.publicKey);
      setView("done");
    } catch (e) {
      if (mine === token.current) fail(e, true);
    }
  }

  function cancel() {
    token.current++;
    setView("idle");
  }

  const title =
    view === "deploy"
      ? "Setting up your account"
      : view === "done"
        ? doneHandle
          ? null
          : "Welcome"
        : isLogin
          ? "Log in to Loot"
          : "Create your account";

  const sub =
    view === "wait"
      ? isLogin
        ? "Confirm in the browser prompt to unlock your smart account."
        : "Your browser is creating a passkey for this site."
      : view === "deploy"
        ? "Passkey created. Deploying your smart account through the relayer."
        : view === "done"
          ? `Your smart account is live on ${NETWORK_LC}. Balance 0 XLM, and that’s fine: fees are covered.`
          : isLogin
            ? "Use the passkey saved on this device. No password, no seed phrase."
            : "One passkey creates a passkey smart account on Stellar. Fees are paid by the relayer, so you need 0 XLM.";

  const busy = view === "wait" || view === "deploy";

  return (
    <div>
      {/* Tabs: enlaces entre /login y /register (mismo layout, el cambio se siente en sitio) */}
      <nav className="grid grid-cols-2 border-b border-[var(--line)]" aria-label="Account">
        {(
          [
            ["login", "Log in", "/login"],
            ["register", "Create account", "/register"],
          ] as const
        ).map(([m, label, href]) => (
          <Link
            key={m}
            href={`${href}${q}`}
            aria-current={m === mode ? "page" : undefined}
            className={`focus-landing -mb-px border-b-2 py-3 text-center text-[14px] ${
              m === mode
                ? "border-[var(--proof)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        {view === "done" && (
          <span className="mb-6 flex size-16 items-center justify-center rounded-[14px] border border-[var(--ok)] text-[var(--ok)]">
            <Check className="size-6" aria-hidden />
          </span>
        )}
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.04em]">
          {title ?? (
            <>
              Welcome, <span className="text-[var(--ok)]">@{doneHandle}</span>
            </>
          )}
        </h1>
        <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">{sub}</p>
      </div>

      <div className="mt-7 space-y-4">
        {/* Alertas */}
        {view === "fail" && failKind === "passkey" && (
          <InlineAlert
            tone="red"
            title={isLogin ? "Passkey login failed" : "Passkey not created"}
            body={
              isLogin
                ? "The prompt was cancelled or timed out. Nothing was signed."
                : "You closed the prompt or it timed out. Nothing was deployed or charged."
            }
          />
        )}
        {view === "fail" && failKind === "unsupported" && (
          <InlineAlert
            tone="gold"
            title="Passkeys unavailable"
            body="This browser or device has no WebAuthn support. Connect a Stellar wallet instead."
          />
        )}
        {view === "fail" && failKind === "unavailable" && (
          <InlineAlert
            tone="gold"
            title="Passkey signup unavailable"
            body="Passkey signup is temporarily unavailable on Mainnet — connect a Stellar wallet. Nothing was charged."
          />
        )}
        {view === "fail" && failKind === "relayer" && (
          <InlineAlert
            tone="gold"
            title="Account not created yet"
            body="Your account wasn’t created yet — please try again in a moment. Nothing was charged."
          />
        )}
        {view === "fail" && failKind === "wallet" && (
          <InlineAlert
            tone="red"
            title="Wallet not connected"
            body={failDetail || "The wallet prompt was closed or the extension is not available."}
          />
        )}
        {view === "none" && (
          <>
            <InlineAlert
              tone="gold"
              title="No account for this passkey"
              body={`This passkey isn’t linked to a Loot passkey smart account on ${NETWORK_LC}.`}
            />
            <Link href={`/register${q}`} className="btn-landing btn-landing-p w-full">
              Create account →
            </Link>
            <button
              type="button"
              onClick={() => void withPasskey()}
              className="btn-landing btn-landing-s w-full"
            >
              Try another passkey
            </button>
          </>
        )}

        {/* Esperando passkey */}
        {view === "wait" && (
          <>
            <div
              className="flex items-center gap-4 rounded-[10px] border border-[var(--line)] border-l-[3px] border-l-[var(--proof)] bg-[var(--s1)] p-4"
              role="status"
            >
              <span
                className="chestzk-spin size-9 shrink-0 rounded-full border-2 border-[var(--line)] border-t-[var(--proof)]"
                aria-hidden
              />
              <div>
                <p className="text-[15px] font-medium">Waiting for your passkey…</p>
                <p className="font-mono text-[12px] text-[var(--dim)]">
                  Face ID · Touch ID · Windows Hello · security key
                </p>
              </div>
            </div>
            <button type="button" onClick={cancel} className="btn-landing btn-landing-s w-full">
              Cancel
            </button>
          </>
        )}

        {/* Deploy */}
        {view === "deploy" && (
          <>
            <ol>
              {STEPS.map((s, i) => {
                const state = i < stage ? "done" : i === stage ? "run" : "idle";
                const label =
                  i === 1 && derived ? `Address ${shortAddr(derived, 4)} derived` : s;
                return (
                  <li
                    key={s}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-[var(--line)] py-3 text-[14px]"
                  >
                    <span className="font-mono text-[12px] text-[var(--dim)]">
                      {String.fromCharCode(97 + i)}
                    </span>
                    <span>{label}</span>
                    <span
                      className="font-mono text-[12px]"
                      style={{
                        color:
                          state === "done"
                            ? "var(--ok)"
                            : state === "run"
                              ? "var(--proof)"
                              : "var(--dim)",
                      }}
                    >
                      {state === "done" ? "done" : state === "run" ? "running…" : "—"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="h-1 overflow-hidden rounded-sm bg-[var(--line)]">
              <div
                className="h-full bg-[var(--proof)] transition-[width] duration-500"
                style={{ width: `${Math.min(100, (stage + 0.5) * 25)}%` }}
              />
            </div>
            <p className="text-[13px] text-[var(--dim)]">
              Fee paid by the relayer. Usually a few seconds on {NETWORK_LC}.
            </p>
          </>
        )}

        {/* Hecho */}
        {view === "done" && doneAddr && (
          <>
            <CopyField value={doneAddr} />
            <Link
              href={next ?? chestPath(SAMPLE_CHEST_ID)}
              className="btn-landing btn-landing-p w-full"
            >
              Open your first chest →
            </Link>
            <Link href="/profile" className="btn-landing btn-landing-s w-full">
              Go to profile
            </Link>
          </>
        )}

        {/* Formulario (idle / fail) */}
        {(view === "idle" || view === "fail") && (
          <>
            {!isLogin && PASSKEY_ENABLED && <SponsorNotice />}
            {!isLogin && PASSKEY_ENABLED && (
              <div>
                <label htmlFor="handle" className="block text-[14px] font-medium">
                  Choose a name
                </label>
                <div
                  className={`mt-2 flex h-11 items-center rounded-[10px] border bg-[var(--bg)] px-3.5 focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-[var(--proof)] ${
                    handleErr ? "border-[var(--red)]" : "border-[var(--line)]"
                  }`}
                >
                  <span className="font-mono text-[15px] text-[var(--dim)]">@</span>
                  <input
                    id="handle"
                    value={handle}
                    onChange={(e) => {
                      setHandleText(e.target.value);
                      const v = e.target.value.trim().toLowerCase();
                      setHandleErr(v && !HANDLE_RE.test(v) ? HANDLE_HINT : null);
                    }}
                    placeholder="keeper"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={20}
                    className="ml-1 w-full bg-transparent font-mono text-[15px] outline-none placeholder:text-[var(--dim)]"
                  />
                </div>
                <p
                  className={`mt-2 text-[13px] ${handleErr ? "text-[var(--red)]" : "text-[var(--dim)]"}`}
                >
                  {handleErr ?? "Shown instead of your address. You can change it later in Profile."}
                </p>
              </div>
            )}

            {!PASSKEY_ENABLED ? (
              <p role="note" className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-4 text-[14px] leading-[1.55] text-[var(--muted)]" style={{ borderLeftWidth: 3, borderLeftColor: "var(--gold)" }}>
                {MAINNET_PASSKEY_NOTE}
              </p>
            ) : (
              <>
            <button
              type="button"
              disabled={busy || (!isLogin && !handleValid)}
              onClick={() => void withPasskey()}
              className="btn-landing btn-landing-p w-full gap-2 disabled:opacity-50"
            >
              <PasskeyGlyph style={{ height: 18, width: "auto" }} />
              {view === "fail" && failKind !== "wallet"
                ? "Try again"
                : isLogin
                  ? "Continue with passkey"
                  : "Create account with passkey"}
            </button>

            <div className="flex items-center gap-3 font-mono text-[12px] text-[var(--dim)]">
              <span className="h-px flex-1 bg-[var(--line)]" />
              or
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void withWallet("freighter")}
                className="btn-landing btn-landing-s gap-2 disabled:opacity-50"
              >
                <FreighterGlyph />
                Freighter
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void withWallet("wallet")}
                className="btn-landing btn-landing-s gap-2 disabled:opacity-50"
              >
                <WalletIcon aria-hidden className="size-[18px]" />
                Other wallet
              </button>
            </div>
            <p className="text-center text-[13px] text-[var(--dim)]">
              Connect wallet via Stellar Wallets Kit · uses your G… address
            </p>

            {isLogin ? (
              <p className="pt-2 text-center text-[14px] text-[var(--muted)]">
                New to Loot?{" "}
                <Link
                  href={`/register${q}`}
                  className="text-[var(--text)] underline underline-offset-4"
                >
                  Create an account
                </Link>
              </p>
            ) : (
              <p className="pt-2 text-center text-[12.5px] text-[var(--dim)]">
                By continuing you agree to the{" "}
                <a href="#" className="text-[var(--text)] underline">
                  Terms
                </a>{" "}
                and{" "}
                <a href="#" className="text-[var(--text)] underline">
                  Privacy Policy
                </a>
                . {IS_MAINNET ? "Mainnet: real funds." : "Testnet only."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
