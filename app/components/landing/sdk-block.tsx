import Link from "next/link";
import { CodeBlock } from "@/components/sdk/code-block";
import { CopyIcon } from "@/components/sdk/copy-icon";

const INSTALL = "npm i @findloot/sdk";

const CODE = `$ npm i @findloot/sdk

import { createChestClient, fingerprintAnswer } from "@findloot/sdk";

const { fingerprintHex } = await fingerprintAnswer("alexandria", 7n);
const client = createChestClient({ publicKey });
const tx = await client.create_chest({ creator, fingerprint, … });
const id = (await tx.signAndSend({ signTransaction })).result.unwrap();`;

/** Landing teaser for /sdk, rendered right before the CTA. */
export function SdkBlock() {
  return (
    <section aria-labelledby="sdk-h" className="px-6 py-24 lg:px-[120px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 rounded-[20px] border border-[var(--line)] bg-[var(--s1)] p-6 sm:p-10 lg:grid-cols-12 lg:p-14">
        <div className="min-w-0 lg:col-span-4">
          <p className="font-mono text-[12px] tracking-[0.06em] text-[var(--proof)]">
            SDK · @findloot/sdk
          </p>
          <h2
            id="sdk-h"
            className="mt-4 text-[clamp(32px,3.2vw,40px)] leading-[1.1] font-semibold tracking-[-0.04em]"
          >
            Put a chest in
            <br />
            your own app.
          </h2>
          <p className="mt-5 text-[17px] leading-[27px] text-[var(--muted)]">
            Hash the answer, escrow XLM and claim with an address-bound proof,
            from TypeScript on Stellar testnet.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/sdk"
              className="focus-landing text-[15px] text-[var(--text)] underline underline-offset-4 hover:text-[var(--proof)]"
            >
              Read the SDK docs →
            </Link>
            <span className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] pr-1 pl-3 font-mono text-[13px]">
              {INSTALL}
              <CopyIcon value={INSTALL} label="Copy install command" />
            </span>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-8">
          <CodeBlock
            code={CODE}
            file="quickstart.ts"
            numbers={false}
            size="sm"
            bg="#0C0B10"
            copy={CODE.replace(/^\$ /, "")}
          />
        </div>
      </div>
    </section>
  );
}
