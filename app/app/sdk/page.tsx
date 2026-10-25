import type { Metadata } from "next";
import { CellsCanvas } from "@/components/cells-canvas";
import { Chest } from "@/components/chest";
import { CopyButton } from "@/components/copy-button";
import { CodeBlock } from "@/components/sdk/code-block";
import { IconChest, IconFlag, IconKey } from "@/components/sdk/sdk-icons";

export const metadata: Metadata = {
  title: "SDK",
  description:
    "Create, read and claim puzzle chests on Stellar from TypeScript with @findloot/sdk. Address-bound ZK proofs, verified on Soroban.",
};

const NPM_URL = "https://www.npmjs.com/package/@findloot/sdk";
const REPO_URL = "https://github.com/Klorenn/LOOT";
const VERSION = "0.1.1";

const STEPS = [
  {
    n: "01",
    title: "Install",
    body: "ESM package. Pulls in @stellar/stellar-sdk and circomlibjs.",
    file: "terminal",
    lang: "Shell",
    label: "Node 20+",
    code: "$ npm i @findloot/sdk",
  },
  {
    n: "02",
    title: "Create a chest",
    body: "Hash the answer locally, then escrow XLM behind the fingerprint. The answer never leaves the device.",
    file: "create.ts",
    label: "Stellar testnet",
    code: `import {
  createChestClient,
  fingerprintAnswer,
  CONTRACTS,
  DEFAULT_AMOUNT_PER_SLOT_STROOPS,
} from "@findloot/sdk";

const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);
const client = createChestClient({ publicKey: creator });

const tx = await client.create_chest({
  creator,
  fingerprint: Buffer.from(fingerprintHex, "hex"),
  token: CONTRACTS.xlm,
  prize: DEFAULT_AMOUNT_PER_SLOT_STROOPS, // 10 XLM
  max_claims: 1,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
});
const { result } = await tx.signAndSend({ signTransaction });
const chestId = result.unwrap();`,
  },
  {
    n: "03",
    title: "Solve and claim",
    body: "Read the chest, prove the answer for your address, claim. The verifier checks the proof on-chain.",
    file: "claim.ts",
    label: "Groth16 · BN254",
    code: `const { result } = await client.get_chest({ chest_id: chestId });
const chest = result.unwrap();

// proof + nullifier: Groth16 (BN254) from the Loot circuit, made in the browser.
// Not exported by @findloot/sdk 0.1.1 yet.
const tx = await client.claim({
  chest_id: chestId,
  recipient: solver, // the address bound inside the proof
  nullifier,
  proof: { a, b, c },
});
await tx.signAndSend({ signTransaction });`,
  },
];

const USES = [
  {
    icon: <IconChest />,
    title: "Treasure hunts",
    body: "Riddles and puzzle trails with an XLM prize at the end. The first valid proof wins.",
  },
  {
    icon: <IconFlag />,
    title: "CTF and bounty prizes",
    body: "Gate a payout behind a flag or answer. Bots that copy a proof from the mempool get nothing.",
  },
  {
    icon: <IconKey />,
    title: "Learn-to-earn quizzes",
    body: "Reward people for knowing the answer. Each proof works once and pays only the address it was made for.",
  },
];

const API: { fn: string; ret: string; what: string }[] = [
  {
    fn: "fingerprintAnswer(answer: string, salt: bigint | string)",
    ret: "Promise<{ fingerprintHex, normalized }>",
    what: "Poseidon(answer, salt) of the normalized answer. Store this on-chain, never the answer.",
  },
  {
    fn: "normalizeAnswer(answer: string)",
    ret: "string",
    what: "Trim, lowercase and strip accents and spaces before hashing.",
  },
  {
    fn: "answerToField(answer) · poseidon2(a, b) · fieldToHex(fe)",
    ret: "bigint · Promise<bigint> · string",
    what: "Low-level field helpers, same encoding as the app.",
  },
  {
    fn: "createChestClient(opts?)",
    ret: "Client",
    what: "Soroban client for the Loot registry. Defaults to testnet and CONTRACTS.chest.",
  },
  {
    fn: "client.create_chest({ creator, fingerprint, token, prize, max_claims, deadline })",
    ret: "Promise<AssembledTransaction<Result<u64>>>",
    what: "Escrow a prize behind a fingerprint. Returns the chest id.",
  },
  {
    fn: "client.get_chest({ chest_id })",
    ret: "Promise<AssembledTransaction<Result<Chest>>>",
    what: "Read creator, token, prize, claims, max_claims, deadline, closed and fingerprint.",
  },
  {
    fn: "client.claim({ chest_id, recipient, nullifier, proof })",
    ret: "Promise<AssembledTransaction<Result<void>>>",
    what: "Verify the proof on Soroban, spend the nullifier, pay the recipient.",
  },
  {
    fn: "client.close_chest({ chest_id })",
    ret: "Promise<AssembledTransaction<Result<i128>>>",
    what: "Creator closes the chest; returns the refunded amount.",
  },
  {
    fn: "NETWORK · CONTRACTS · DEFAULT_AMOUNT_PER_SLOT_STROOPS",
    ret: "const",
    what: "Testnet RPC, Horizon and Friendbot, contract ids (chest, verifier, xlm), and 10 XLM in stroops.",
  },
];

const CONCEPTS = [
  {
    n: "01",
    color: "var(--proof)",
    title: "Proof bound to your address",
    body: "The solver address is a public input of the Groth16 proof. A copied proof cannot pay anyone else.",
  },
  {
    n: "02",
    color: "var(--ok)",
    title: "Nullifier",
    body: "Each proof spends a nullifier stored on-chain, so the same proof can't be replayed.",
  },
  {
    n: "03",
    color: "var(--gold)",
    title: "Soroban verifier",
    body: "The registry calls the verifier contract, which checks the BN254 proof on-chain.",
  },
  {
    n: "04",
    color: "var(--red)",
    title: "Relayer gas",
    body: "Claims can be submitted by a relayer, so new solvers do not need XLM for fees.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
      {children}
    </p>
  );
}

export default function SdkPage() {
  return (
    <main>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <CellsCanvas cx={0.8} className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col gap-10 px-6 pt-20 pb-20 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 max-w-[640px]">
            <p className="flex items-center gap-2 font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">
              <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
              @findloot/sdk · v{VERSION} · MIT
            </p>
            <h1 className="mt-5 text-[clamp(44px,6vw,64px)] leading-[1] font-semibold tracking-[-0.044em]">
              Build with <span className="text-[var(--proof)]">Loot</span>.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-[var(--muted)]">
              Create, read and claim puzzle chests on Stellar from TypeScript.
              Address-bound ZK proofs, verified on Soroban.
            </p>
          </div>
          <div className="shrink-0">
            <Chest open={30} className="w-[200px] lg:w-[240px]" />
          </div>
        </div>
      </header>

      {/* Install row */}
      <section
        aria-label="Install"
        className="border-b border-[var(--line)]"
      >
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-6 py-8 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 min-w-0 items-center overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--s1)] px-4 font-mono text-[15px] whitespace-nowrap">
              <span className="text-[var(--dim)]">$&nbsp;</span>npm i @findloot/sdk
            </div>
            <CopyButton value="npm i @findloot/sdk" />
          </div>
          <div className="flex items-center gap-5 text-[14px]">
            <a
              href={NPM_URL}
              className="focus-landing text-[var(--text)] underline underline-offset-4 hover:text-[var(--proof)]"
            >
              npm →
            </a>
            <a
              href={REPO_URL}
              className="focus-landing text-[var(--text)] underline underline-offset-4 hover:text-[var(--proof)]"
            >
              GitHub →
            </a>
          </div>
          <p className="font-mono text-[12px] text-[var(--dim)] lg:ml-auto">
            Bindings: @findloot/chest · Stellar testnet
          </p>
        </div>
      </section>

      {/* Quickstart */}
      <section
        aria-labelledby="quickstart-h"
        className="border-b border-[var(--line)] py-24"
      >
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Quickstart</Eyebrow>
          <h2
            id="quickstart-h"
            className="mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.04em]"
          >
            Three steps to a live chest.
          </h2>
          <div className="mt-12 border-t border-[var(--line)]">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-1 gap-6 border-b border-[var(--line)] py-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12"
              >
                <div>
                  <span className="font-mono text-[13px] text-[var(--proof)]">
                    {s.n}
                  </span>
                  <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                    {s.body}
                  </p>
                </div>
                <CodeBlock
                  code={s.code}
                  file={s.file}
                  lang={s.lang}
                  label={s.label}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you can build */}
      <section
        aria-labelledby="build-h"
        className="border-b border-[var(--line)] py-24"
      >
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Use cases</Eyebrow>
          <h2
            id="build-h"
            className="mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.04em]"
          >
            One primitive, many games.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
            {USES.map((u) => (
              <div key={u.title} className="bg-[var(--bg)] p-8">
                {u.icon}
                <h3 className="mt-6 text-[20px] font-semibold tracking-[-0.02em]">
                  {u.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API reference */}
      <section
        aria-labelledby="api-h"
        className="border-b border-[var(--line)] py-24"
      >
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>API reference</Eyebrow>
          <h2
            id="api-h"
            className="mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.04em]"
          >
            Everything in @findloot/sdk.
          </h2>
          <div className="mt-12 overflow-x-auto border-t border-[var(--line)]">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="font-mono text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase">
                  <th className="w-[36%] py-3 pr-6 font-medium">Function</th>
                  <th className="w-[26%] py-3 pr-6 font-medium">Returns</th>
                  <th className="py-3 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody>
                {API.map((r) => (
                  <tr key={r.fn} className="border-t border-[var(--line)] align-top">
                    <td className="py-4 pr-6 font-mono text-[13px] leading-[1.6] text-[var(--proof)]">
                      {r.fn}
                    </td>
                    <td className="py-4 pr-6 font-mono text-[13px] leading-[1.6] text-[var(--muted)]">
                      {r.ret}
                    </td>
                    <td className="py-4 text-[14px] leading-[1.6] text-[var(--muted)]">
                      {r.what}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 font-mono text-[12px] text-[var(--dim)]">
            Proof generation (Groth16 witness + prove) is not exported in {VERSION}.
            client.* methods come from @findloot/chest.
          </p>
        </div>
      </section>

      {/* Concepts */}
      <section aria-labelledby="concepts-h" className="py-24">
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Concepts</Eyebrow>
          <h2
            id="concepts-h"
            className="mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.04em]"
          >
            Why bots can&apos;t steal the prize.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
            {CONCEPTS.map((c) => (
              <div key={c.n} className="bg-[var(--bg)] p-7">
                <span
                  className="font-mono text-[13px]"
                  style={{ color: c.color }}
                >
                  {c.n}
                </span>
                <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.02em]">
                  {c.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
