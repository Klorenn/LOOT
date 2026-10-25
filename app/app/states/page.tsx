import Link from "next/link";
import { DEMO_PATH } from "@/lib/demo";
import { PageHeader } from "@/components/page-header";
import { InlineAlert } from "@/components/inline-alert";
import { ExampleTag } from "@/components/example-tag";
import { StateBlock } from "@/components/state-block";
import { chestPath } from "@/lib/chest-code";
import { DEMO_CHEST } from "@/lib/config";

const FP = `0x${DEMO_CHEST.fingerprintHex.slice(0, 4)}…${DEMO_CHEST.fingerprintHex.slice(-4)}`;

function Divider() {
  return <div className="border-t border-[var(--line)]" />;
}

export default function StatesPage() {
  return (
    <main>
      <PageHeader
        tint="red"
        eyebrow="States"
        title="Errors & empty states"
        lead="Every failure says what happened, why, and the one next step. Color carries the meaning: red = rejected, gold = needs action, proof = system."
      />

      <div className="mx-auto max-w-[960px] space-y-12 px-6 py-14">
        <StateBlock
          tone="red"
          label="Wrong answer"
          title="That answer doesn’t open this chest."
          body={`The proof can’t be generated because your answer’s hash doesn’t match ${FP}. Nothing was sent on-chain and no attempt was used.`}
          actions={[
            { href: DEMO_PATH, label: "Try again", primary: true },
            { href: "/explore", label: "Back to chests" },
          ]}
        />
        <Divider />
        <StateBlock
          tone="proof"
          label="Proof already used"
          title="This proof was already spent."
          body="The nullifier is already stored on this chest, so replaying the same proof reverts. Each proof works once and only pays the address it was made for."
          chest="open"
          actions={[
            { href: DEMO_PATH, label: "Open the demo chest", primary: true },
            { href: "/claimed-chests", label: "My claimed chests" },
          ]}
        />
        <Divider />
        <StateBlock
          tone="red"
          label="Proof failed"
          title="Your browser couldn’t finish the proof."
          body="The proof stopped before it was sent (for example out of memory). Close other tabs and retry, or switch to a desktop browser. Your answer is still only on this device."
          visual={
            <div className="w-[190px] rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-3 font-mono text-[11px] leading-[1.7] text-[var(--dim)]">
              <p className="text-[var(--red)]">ERR witness</p>
              <p>step c · 2/4</p>
              <p>RangeError: OOM</p>
              <p className="mt-1">
                <ExampleTag>example log</ExampleTag>
              </p>
            </div>
          }
          actions={[
            { href: DEMO_PATH, label: "Retry proof", primary: true },
            { href: "#", label: "Copy error log" },
          ]}
        />
        <Divider />
        <StateBlock
          tone="gold"
          label="Wallet not connected"
          title="Connect to seal the proof to you."
          body="The proof needs your address as a public input. Without it, anyone could copy it. Use a passkey (no extension) or a Stellar wallet such as Freighter."
          actions={[
            { href: "/login", label: "Continue with passkey", primary: true },
            { href: "/login", label: "Use Freighter" },
          ]}
        />
        <Divider />
        <StateBlock
          tone="dim"
          label="Empty"
          title="No chests match these filters."
          body="Try clearing the difficulty filter, or be the first to hide a prize."
          visual={
            <div
              className="h-[84px] w-[110px] rounded-[10px] border border-dashed border-[var(--line)]"
              aria-hidden
            />
          }
          actions={[
            { href: "/explore", label: "Clear filters" },
            { href: "/create", label: "Create a chest", primary: true },
          ]}
        />
        <Divider />

        <div className="space-y-4">
          <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
            Inline alerts
          </p>
          <InlineAlert
            tone="red"
            title="Transaction reverted"
            body="Soroban rejected the claim. The contract error is shown in the technical details."
          />
          <InlineAlert
            tone="gold"
            title="Relayer unavailable"
            body="Fees are paid by the relayer and it did not respond. Try again in a moment."
          />
          <InlineAlert
            tone="dim"
            title="Chest expired"
            body="Unclaimed prize can be withdrawn by the creator."
          />
        </div>

        <p className="font-mono text-[13px] text-[var(--dim)]">
          404 →{" "}
          <Link href="/this-chest-does-not-exist" className="text-[var(--text)] underline">
            see 404 page
          </Link>
        </p>
      </div>
    </main>
  );
}
