import type { Metadata } from "next";
import { CellsCanvas } from "@/components/cells-canvas";
import { Chest } from "@/components/chest";
import { CodeBlock } from "@/components/sdk/code-block";
import { CopyIcon } from "@/components/sdk/copy-icon";
import { IconChest, IconFlag, IconKey } from "@/components/sdk/sdk-icons";

export const metadata: Metadata = {
  title: "SDK",
  description:
    "Create, read and claim puzzle chests on Stellar from TypeScript with @findloot/sdk. Address-bound ZK proofs, verified on Soroban.",
};

const NPM_URL = "https://www.npmjs.com/package/@findloot/sdk";
const REPO_URL = "https://github.com/Klorenn/LOOT";
const CHEST_NPM_URL = "https://www.npmjs.com/package/@findloot/chest";
const VERSION = "0.1.1";
const INSTALL = "npm i @findloot/sdk";

const STEPS = [
  {
    n: "1",
    title: "Install",
    body: "One ESM package. It pulls in @stellar/stellar-sdk and circomlibjs.",
    file: "terminal",
    lang: "Shell",
    shell: true,
    code: `$ ${INSTALL}`,
    copy: INSTALL,
  },
  {
    n: "2",
    title: "Create a chest",
    body: "Hash the answer on the device, then escrow XLM behind the fingerprint. Returns the chest id.",
    file: "create.ts",
    lang: "TypeScript",
    code: `import {
  createChestClient,
  fingerprintAnswer,
  CONTRACTS,
  DEFAULT_AMOUNT_PER_SLOT_STROOPS,
} from "@findloot/sdk";

// 1. Hash the answer locally — only the fingerprint goes on-chain
const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);

// 2. Escrow 10 XLM behind it
const client = createChestClient({ publicKey: creator });
const tx = await client.create_chest({
  creator,
  fingerprint: Buffer.from(fingerprintHex, "hex"),
  token: CONTRACTS.xlm,
  prize: DEFAULT_AMOUNT_PER_SLOT_STROOPS,
  max_claims: 1,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
});
// signer passed at send time (wiring unverified)
const sent = await tx.signAndSend({ signTransaction });
const chestId = sent.result.unwrap();`,
  },
  {
    n: "3",
    title: "Solve and claim",
    body: "Read the chest, prove the answer for your own address and claim. Soroban verifies the proof on-chain.",
    file: "claim.ts",
    lang: "TypeScript",
    code: `const chest = (await client.get_chest({ chest_id: chestId })).result.unwrap();

// proof + nullifier come from the Loot Groth16 circuit (BN254),
// generated in the browser — not exported by @findloot/sdk 0.1.1
const tx = await client.claim({
  chest_id: chestId,
  recipient: solver, // public input of the proof
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
    body: "Gate a payout behind a flag. A proof copied from the mempool pays nobody else.",
  },
  {
    icon: <IconKey />,
    title: "Campaign quests",
    body: "Onboarding quests and campaigns with a fixed number of winners, set with max_claims.",
  },
];

type Row = { fn: string; args?: string; ret: string; what: string };
const API: { group: string; rows: Row[] }[] = [
  {
    group: "Helpers",
    rows: [
      {
        fn: "fingerprintAnswer",
        args: "(answer: string, salt: bigint | string)",
        ret: "Promise<{ fingerprintHex, normalized }>",
        what: "Poseidon(answer, salt) of the normalized answer. Store this on-chain, never the answer.",
      },
      {
        fn: "normalizeAnswer",
        args: "(answer: string)",
        ret: "string",
        what: "Trim, lowercase and strip accents and spaces before hashing.",
      },
      {
        fn: "answerToField",
        args: "(answer: string)",
        ret: "bigint",
        what: "Encode an answer as a BN254 field element, same as the app.",
      },
      {
        fn: "poseidon2",
        args: "(a: bigint, b: bigint)",
        ret: "Promise<bigint>",
        what: "Two-input Poseidon hash over the field.",
      },
      {
        fn: "fieldToHex",
        args: "(fe: bigint | string)",
        ret: "string",
        what: "Field element to hex, as stored in the fingerprint.",
      },
    ],
  },
  {
    group: "Client · @findloot/chest",
    rows: [
      {
        fn: "createChestClient",
        args: "(opts?)",
        ret: "Client",
        what: "Soroban client for the Loot registry. Defaults to testnet and CONTRACTS.chest.",
      },
      {
        fn: "client.create_chest",
        args: "({ creator, fingerprint, token, prize, max_claims, deadline })",
        ret: "Promise<AssembledTransaction<Result<u64>>>",
        what: "Escrow a prize behind a fingerprint. Returns the chest id.",
      },
      {
        fn: "client.get_chest",
        args: "({ chest_id })",
        ret: "Promise<AssembledTransaction<Result<Chest>>>",
        what: "Read creator, token, prize, claims, max_claims, deadline, closed and fingerprint.",
      },
      {
        fn: "client.claim",
        args: "({ chest_id, recipient, nullifier, proof })",
        ret: "Promise<AssembledTransaction<Result<void>>>",
        what: "Verify the proof on Soroban, spend the nullifier, pay the recipient.",
      },
      {
        fn: "client.close_chest",
        args: "({ chest_id })",
        ret: "Promise<AssembledTransaction<Result<i128>>>",
        what: "Creator closes the chest; returns the refunded amount.",
      },
    ],
  },
  {
    group: "Constants",
    rows: [
      {
        fn: "NETWORK",
        ret: "{ name, passphrase, rpcUrl, horizonUrl, friendbotUrl }",
        what: "Stellar testnet endpoints.",
      },
      {
        fn: "CONTRACTS",
        ret: "{ chest, verifier, xlm }",
        what: "Testnet contract ids: the registry, the Groth16 verifier and the XLM asset contract.",
      },
      {
        fn: "DEFAULT_AMOUNT_PER_SLOT_STROOPS",
        ret: "100000000n",
        what: "10 XLM per slot, in stroops.",
      },
    ],
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
    body: "Every claim spends a nullifier stored on-chain, so the same proof can never be replayed.",
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
    body: "Claims can go through a relayer, so new solvers need no XLM for fees.",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
      {children}
    </p>
  );
}

const H2 =
  "mt-4 text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.04em]";
const SECTION = "border-b border-[var(--line)] py-28";
const LINK =
  "focus-landing text-[14px] text-[var(--text)] underline underline-offset-4 hover:text-[var(--proof)]";

export default function SdkPage() {
  return (
    <main>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <CellsCanvas
          cx={0.8}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-12 lg:py-24">
          <div className="min-w-0 lg:col-span-7">
            <p className="flex flex-wrap items-center gap-x-2 font-mono text-[13px] tracking-[0.04em] text-[var(--dim)]">
              <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
              <span>@findloot/sdk</span>
              <span>v{VERSION}</span>
              <span>MIT</span>
              <span>Stellar testnet</span>
            </p>
            <h1 className="mt-6 text-[clamp(44px,6vw,76px)] leading-[0.975] font-semibold tracking-[-0.045em]">
              Ship puzzle chests
              <br />
              from <span className="text-[var(--proof)]">TypeScript</span>.
            </h1>
            <p className="mt-7 max-w-[34rem] text-[18px] leading-[1.55] text-[var(--muted)]">
              Create, read and claim Loot chests on Stellar. Answers stay on the
              device; proofs are bound to the solver&apos;s address and verified
              on Soroban.
            </p>
            <div className="mt-9 flex h-14 w-full max-w-[440px] items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--s1)] pr-2 pl-5">
              <span className="min-w-0 overflow-x-auto font-mono text-[16px] whitespace-nowrap">
                <span className="text-[var(--dim)]">$&nbsp;</span>
                {INSTALL}
              </span>
              <CopyIcon value={INSTALL} size={40} bordered label="Copy install command" />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
              <a href={NPM_URL} className={LINK}>
                npm ↗
              </a>
              <a href={REPO_URL} className={LINK}>
                GitHub ↗
              </a>
              <a href={CHEST_NPM_URL} className={LINK}>
                Bindings · @findloot/chest
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:col-span-5 lg:justify-end">
            <Chest open={30} className="w-[240px] lg:w-[340px]" />
          </div>
        </div>
      </header>

      {/* Quickstart */}
      <section aria-labelledby="quickstart-h" className={SECTION}>
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Quickstart</Eyebrow>
          <h2 id="quickstart-h" className={H2}>
            From install to a live chest.
          </h2>
          <p className="mt-4 max-w-[40rem] text-[17px] leading-[1.55] text-[var(--muted)]">
            Three calls. The answer is hashed on the device; only the fingerprint
            reaches the ledger.
          </p>
          <ol className="mt-14">
            {STEPS.map((s, i) => {
              const last = i === STEPS.length - 1;
              return (
                <li
                  key={s.n}
                  className={`grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 gap-y-5 lg:grid-cols-[48px_320px_minmax(0,1fr)] lg:gap-x-6 ${last ? "" : "pb-14"}`}
                >
                  <div className="row-span-2 flex flex-col items-start lg:row-span-1">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg)] font-mono text-[13px] text-[var(--proof)]">
                      {s.n}
                    </span>
                    {!last && (
                      <span
                        aria-hidden
                        className="mt-2 ml-[17px] w-px flex-1 bg-[var(--line)]"
                      />
                    )}
                  </div>
                  <div className="min-w-0 pt-1">
                    <h3 className="text-[24px] font-semibold tracking-[-0.02em]">
                      {s.title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted)]">
                      {s.body}
                    </p>
                  </div>
                  <div className="col-start-2 min-w-0 lg:col-start-3">
                    <CodeBlock
                      code={s.code}
                      file={s.file}
                      lang={s.lang}
                      copy={s.copy}
                      shell={s.shell}
                      numbers={!s.shell}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* What you can build */}
      <section aria-labelledby="build-h" className={SECTION}>
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Use cases</Eyebrow>
          <h2 id="build-h" className={H2}>
            One primitive, many games.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
            {USES.map((u) => (
              <div key={u.title} className="bg-[var(--bg)] p-10">
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
      <section aria-labelledby="api-h" className={SECTION}>
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>API reference</Eyebrow>
          <h2 id="api-h" className={H2}>
            Everything in @findloot/sdk.
          </h2>
          <div className="mt-12 border-t border-[var(--line)]">
            <div
              className="hidden grid-cols-[44fr_24fr_32fr] gap-6 py-3 font-mono text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase lg:grid"
              aria-hidden
            >
              <span>Function</span>
              <span>Returns</span>
              <span>What it does</span>
            </div>
            {API.map((g) => (
              <div key={g.group} role="rowgroup">
                <p className="border-t border-[var(--line)] pt-5 pb-2 font-mono text-[12px] tracking-[0.08em] text-[#8A8CFF] uppercase">
                  {g.group}
                </p>
                {g.rows.map((r) => (
                  <div
                    key={r.fn}
                    className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--line)] py-4 lg:grid-cols-[44fr_24fr_32fr]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[14px] break-words text-[var(--text)]">
                        {r.fn}
                      </div>
                      {r.args && (
                        <div className="mt-1 font-mono text-[12.5px] leading-[1.5] break-words text-[#6F6A7A]">
                          {r.args}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 font-mono text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-[#C9CAFF]">
                      {r.ret}
                    </div>
                    <div className="text-[14px] leading-[1.6] text-[var(--muted)]">
                      {r.what}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-8 border-l-2 border-[var(--gold)] py-1 pl-4 text-[14px] leading-[1.6] text-[var(--muted)]">
            Proof generation (witness + Groth16 prove) is not exported in{" "}
            {VERSION}. Pass your wallet signer to{" "}
            <code className="font-mono text-[13px] text-[var(--text)]">
              signAndSend({"{ signTransaction }"})
            </code>{" "}
            (wiring unverified). client.* methods come from @findloot/chest.
          </p>
        </div>
      </section>

      {/* Concepts */}
      <section aria-labelledby="concepts-h" className="py-28">
        <div className="mx-auto max-w-[1200px] px-6">
          <Eyebrow>Concepts</Eyebrow>
          <h2 id="concepts-h" className={H2}>
            Why bots can&apos;t steal the prize.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-px border border-[var(--line)] bg-[var(--line)] md:grid-cols-2">
            {CONCEPTS.map((c) => (
              <div key={c.n} className="bg-[var(--bg)] p-10">
                <span className="font-mono text-[13px]" style={{ color: c.color }}>
                  {c.n}
                </span>
                <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">
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
