import { PageHeader } from "@/components/app/page-header";
import { StateBlock } from "@/components/app/state-block";
import { InlineAlert } from "@/components/app/inline-alert";

export default function StatesPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Design system · error & empty"
        title="States"
        lead="Reusable blocks for wrong answer, claimed, proof failed, wallet, empty, and inline alerts."
      />

      <div className="mx-auto max-w-[960px] space-y-16 px-6 py-14">
        <StateBlock
          tone="red"
          label="Wrong answer"
          title="That answer doesn't open this chest."
          body="Hash mismatch — nothing was sent on-chain. No attempt was used."
          chest="closed"
          actions={[
            { href: "#", label: "Try again", primary: true },
            { href: "/explore", label: "Back to chests" },
          ]}
        />

        <StateBlock
          tone="proof"
          label="Already claimed"
          title="Someone opened this chest first."
          body="Claimed by another address. Replays revert — the nullifier is spent."
          chest="open"
          actions={[
            { href: "/explore", label: "Find an open chest", primary: true },
            { href: "/explore", label: "View claim tx" },
          ]}
        />

        <StateBlock
          tone="red"
          label="Proof failed"
          title="Your browser couldn't finish the proof."
          body="The answer stayed on this device. Retry or copy the error log."
          chest="none"
          actions={[
            { href: "#", label: "Retry proof", primary: true },
            { href: "#", label: "Copy error log" },
          ]}
        />

        <StateBlock
          tone="gold"
          label="Wallet"
          title="Connect to seal the proof to you."
          body="Your address becomes a public input. Only it can claim."
          chest="closed"
          actions={[
            { href: "/enter", label: "Continue with passkey", primary: true },
            { href: "/enter", label: "Use Freighter" },
          ]}
        />

        <StateBlock
          tone="dim"
          label="Empty"
          title="No chests match these filters."
          body="Clear filters or create a new chest for solvers to find."
          chest="none"
          actions={[
            { href: "/explore", label: "Clear filters", primary: true },
            { href: "/create", label: "Create a chest" },
          ]}
        />

        <div className="space-y-4">
          <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
            Inline alerts
          </p>
          <InlineAlert
            tone="red"
            title="Transaction reverted"
            body="Soroban rejected the claim. Check nullifier and sender == prover."
          />
          <InlineAlert
            tone="gold"
            title="Relayer unavailable"
            body="Pay gas with your wallet, or try again in a moment."
          />
          <InlineAlert
            tone="dim"
            title="Chest expired"
            body="Unclaimed prize returned to the creator."
          />
        </div>
      </div>
    </main>
  );
}
