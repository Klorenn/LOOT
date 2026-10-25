import Link from "next/link";

/** Landing teaser for /sdk, rendered right before the CTA. */
export function SdkBlock() {
  return (
    <section
      aria-labelledby="sdk-h"
      className="px-6 py-24 lg:px-[120px]"
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 border-y border-[var(--line)] py-14 lg:grid-cols-[520px_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--proof)]">
            SDK · @findloot/sdk
          </p>
          <h2
            id="sdk-h"
            className="mt-4 text-[clamp(32px,3.2vw,40px)] leading-[1.1] font-semibold tracking-[-0.04em]"
          >
            Put a chest in your own app.
          </h2>
          <p className="mt-5 text-[17px] leading-[27px] text-[var(--muted)]">
            Hash the answer, escrow XLM and claim with an address-bound proof,
            from TypeScript on Stellar testnet.
          </p>
          <Link
            href="/sdk"
            className="focus-landing mt-7 inline-block text-[15px] text-[var(--text)] underline underline-offset-4 hover:text-[var(--proof)]"
          >
            Read the SDK docs →
          </Link>
        </div>
        <pre className="min-w-0 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--s1)] px-6 py-[22px] font-mono text-[13px] leading-5">
          <code>
            <span className="block text-[var(--ok)]">$ npm i @findloot/sdk</span>
            <span className="block min-h-5">&nbsp;</span>
            <span className="block whitespace-pre text-[var(--text)]">
              {`import { createChestClient, fingerprintAnswer } from "@findloot/sdk";`}
            </span>
            <span className="block whitespace-pre text-[var(--muted)]">
              {`const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);`}
            </span>
            <span className="block whitespace-pre text-[var(--muted)]">
              {`const client = createChestClient({ publicKey: creator });`}
            </span>
            <span className="block whitespace-pre text-[var(--proof)]">
              {`await (await client.create_chest({ … })).signAndSend();`}
            </span>
          </code>
        </pre>
      </div>
    </section>
  );
}
