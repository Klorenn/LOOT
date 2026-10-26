import type { Metadata } from "next";
import { KuyfiBadge } from "@/components/kuyfi-badge";
import { PageHeader } from "@/components/page-header";
import { cfg } from "@/lib/cfg";
import { shortAddr } from "@/lib/format";
import { MAINNET_RECORD } from "@/lib/mainnet-record";
import { networkFacts } from "@/lib/onchain-facts";

export const metadata: Metadata = { title: "Network" };
export const dynamic = "force-dynamic";

const WASM_SHORT = (h: string | null) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "unavailable");

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[var(--line)] py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">{k}</dt>
      <dd className="min-w-0 break-all font-mono text-[13px] text-[var(--text)]">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
      <dl className="mt-3 border-t border-[var(--line)]">{children}</dl>
    </section>
  );
}

export default async function NetworkPage() {
  const c = await cfg();
  const { NETWORK, CONTRACTS, IS_MAINNET, CAPS } = c;
  const f = await networkFacts(c);
  const ex = NETWORK.explorerUrl;
  const link = (id: string) => (
    <a href={`${ex}/${id.startsWith("C") ? "contract" : "account"}/${id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--proof)]">
      {id}
    </a>
  );

  return (
    <main>
      <PageHeader
        tint={IS_MAINNET ? "ok" : "proof"}
        eyebrow={<span>Network · {c.NETWORK_LABEL}</span>}
        title={IS_MAINNET ? "Mainnet, live facts" : "Testnet, live facts"}
        lead={
          IS_MAINNET
            ? "Real funds on Stellar mainnet. Everything below is read live from the network or recorded at deploy time."
            : "Stellar testnet: play money. Use the switch in the top bar to see mainnet."
        }
      />
      <div className="mx-auto max-w-[900px] px-6 pb-20">
        <Section title="Contracts">
          <Row k="Registry">{CONTRACTS.chest ? link(CONTRACTS.chest) : "not configured"}</Row>
          <Row k="Verifier">{CONTRACTS.verifier ? link(CONTRACTS.verifier) : "not configured"}</Row>
          <Row k="Prize token (native XLM SAC)">{link(CONTRACTS.token)}</Row>
          {IS_MAINNET && <Row k="Admin / deployer">{link(MAINNET_RECORD.admin)}</Row>}
          <Row k="Registry wasm (live)">
            {f.wasm.registry ?? "unavailable"}
            {IS_MAINNET && f.wasm.registry && (
              <span className={f.wasm.registry === MAINNET_RECORD.registryWasm ? "text-[var(--ok)]" : "text-[var(--red)]"}>
                {" "}
                · {f.wasm.registry === MAINNET_RECORD.registryWasm ? "matches the deploy record" : "DIFFERS from the deploy record"}
              </span>
            )}
          </Row>
          <Row k="Verifier wasm (live)">
            {f.wasm.verifier ?? "unavailable"}
            {IS_MAINNET && f.wasm.verifier && (
              <span className={f.wasm.verifier === MAINNET_RECORD.verifierWasm ? "text-[var(--ok)]" : "text-[var(--red)]"}>
                {" "}
                · {f.wasm.verifier === MAINNET_RECORD.verifierWasm ? "matches the ceremony build" : "DIFFERS from the ceremony build"}
              </span>
            )}
          </Row>
        </Section>

        <Section title="Relayer (pays network fees for passkey accounts and claims)">
          <Row k="Account">{f.relayer.address ? link(f.relayer.address) : "not configured"}</Row>
          <Row k="Balance (live)">{f.relayer.balanceXlm === null ? "unavailable" : `${f.relayer.balanceXlm} XLM`}</Row>
          <Row k="Sponsoring">
            {f.relayer.status === null ? "unknown" : f.relayer.status.sponsoring ? (
              <span className="text-[var(--ok)]">active{f.relayer.status.registrationsLeft !== undefined ? ` · ${f.relayer.status.registrationsLeft} sponsored accounts left` : ""}</span>
            ) : (
              <span className="text-[var(--gold)]">paused{f.relayer.status.notice ? ` · ${f.relayer.status.notice}` : ""}</span>
            )}
          </Row>
        </Section>

        {IS_MAINNET && (
          <Section title="Deployment (2026-10-26)">
            {MAINNET_RECORD.txs.map((t) => (
              <Row key={t.hash} k={t.label}>
                <a href={`${ex}/tx/${t.hash}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--proof)]">
                  {shortAddr(t.hash, 10)}
                </a>
              </Row>
            ))}
          </Section>
        )}

        <Section title="Trusted setup">
          {IS_MAINNET ? (
            <>
              <Row k="Ceremony">1 contributor + a Stellar ledger beacon (ledger {MAINNET_RECORD.ceremony.beaconLedger}, not pre-announced)</Row>
              <Row k="Transcript">
                <a href={MAINNET_RECORD.ceremony.transcriptUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--proof)]">
                  circuits/ceremony/release-2026-10-26/TRANSCRIPT.md
                </a>
              </Row>
            </>
          ) : (
            <Row k="Testnet setup">Single-party setup. Fine for testing, never for real funds.</Row>
          )}
        </Section>

        <Section title="Security scan">
          <Row k="Registry"><KuyfiBadge contractId={CONTRACTS.chest} /></Row>
          <Row k="Verifier"><KuyfiBadge contractId={CONTRACTS.verifier} /></Row>
          {IS_MAINNET && (
            <>
              <Row k="Scanned build">
                Kuyfi scanned the testnet registry (wasm {WASM_SHORT(f.scannedRegistryWasm)}).{" "}
                {f.sameAsScanned === true && <span className="text-[var(--ok)]">The mainnet registry runs the same wasm.</span>}
                {f.sameAsScanned === false && (
                  <span className="text-[var(--gold)]">The mainnet registry wasm ({WASM_SHORT(f.wasm.registry)}) is a different build: the scan result is not a claim about it.</span>
                )}
                {f.sameAsScanned === null && <span className="text-[var(--dim)]">Could not compare the wasm hashes right now.</span>}
              </Row>
              <Row k="Verifier">New ceremony keys, scan pending.</Row>
            </>
          )}
          <Row k="Status">{IS_MAINNET ? "Beta · Scanned with Kuyfi (black-box, 0 findings, testnet build) · not a formal audit" : "Beta · Scanned with Kuyfi (black-box, 0 findings) · not a formal audit"}</Row>
        </Section>

        {IS_MAINNET && (
          <Section title="Beta limits">
            <Row k="Prize per claim">at most {CAPS.maxPrizePerPlaceXlm} XLM</Row>
            <Row k="Total per chest">at most {CAPS.maxTotalPrizeXlm} XLM</Row>
            <Row k="Expiry">at most 30 days (required; no open-ended chests)</Row>
            <Row k="Passkey accounts sponsored">max 60 in total; paused if the relayer drops below 3 XLM</Row>
            <Row k="Who can create chests">approved creators only during the beta</Row>
          </Section>
        )}
      </div>
    </main>
  );
}
