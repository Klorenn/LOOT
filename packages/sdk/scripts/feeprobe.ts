/**
 * Fee investigation helper (testnet).
 *   npx tsx scripts/feeprobe.ts tx <hash>          -> actual fee breakdown from tx meta
 *   npx tsx scripts/feeprobe.ts sim <factoryId>    -> simulate create_chest, print resources
 *   npx tsx scripts/feeprobe.ts config             -> network rent/fee settings
 */
import { execFileSync } from "node:child_process";
import { Address, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, keypairSigner } from "../src/index.js";
import { simulate } from "../src/chain.js";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const [cmd, arg] = process.argv.slice(2);
const stroops = (n: unknown) => `${n} (${(Number(n) / 1e7).toFixed(4)} XLM)`;

if (cmd === "tx") {
  const r = await server.getTransaction(arg);
  const meta = (r as any).resultMetaXdr as xdr.TransactionMeta;
  const v = meta.v4?.() ?? meta.v3();
  const sm: any = (v as any).sorobanMeta();
  const ext = sm.ext().v1?.();
  console.log("status", r.status);
  console.log("feeCharged (result)", stroops((r as any).resultXdr.feeCharged().toString()));
  if (ext) {
    console.log("nonRefundableResourceFeeCharged", stroops(ext.totalNonRefundableResourceFeeCharged().toString()));
    console.log("refundableResourceFeeCharged", stroops(ext.totalRefundableResourceFeeCharged().toString()));
    console.log("rentFeeCharged", stroops(ext.rentFeeCharged().toString()));
  }
  const tx: any = (r as any).envelopeXdr;
  const inner = tx.v1().tx();
  const sd = inner.ext().sorobanData();
  console.log("declared resourceFee", stroops(sd.resourceFee().toString()), "tx.fee", inner.fee());
  const res = sd.resources();
  console.log("instructions", res.instructions(), "readBytes", res.diskReadBytes?.() ?? res.readBytes?.(), "writeBytes", res.writeBytes());
  console.log("footprint RO", res.footprint().readOnly().length, "RW", res.footprint().readWrite().length);
  // ledger entry changes with sizes
  const changes = v.operations()[0].changes();
  for (const c of changes) {
    const t = c.switch().name;
    if (t === "ledgerEntryCreated" || t === "ledgerEntryUpdated") {
      const e = c.value() as xdr.LedgerEntry;
      console.log(t, e.data().switch().name, e.toXDR().length, "bytes");
    }
  }
} else if (cmd === "sim") {
  const creator = execFileSync("stellar", ["keys", "address", "chestzk-e2e-creator"], { encoding: "utf8" }).trim();
  const days = Number(process.env.DAYS ?? 3);
  const q = process.env.Q ?? "What is the capital of Portugal?";
  const { sim } = await simulate(
    arg ?? CONTRACTS.factory,
    "create_chest",
    [
      new Address(creator).toScVal(),
      nativeToScVal(q, { type: "string" }),
      xdr.ScVal.scvBytes(Buffer.alloc(32, 7)),
      nativeToScVal(20_000_000n, { type: "i128" }),
      nativeToScVal(3, { type: "u32" }),
      nativeToScVal(days, { type: "u32" }),
    ],
    { source: creator },
  );
  const sd = sim.transactionData.build();
  const res = sd.resources();
  console.log("minResourceFee", stroops(sim.minResourceFee));
  console.log("instructions", res.instructions(), "writeBytes", res.writeBytes());
  console.log("footprint RO", res.footprint().readOnly().length, "RW", res.footprint().readWrite().length);
  for (const k of res.footprint().readWrite()) console.log("  RW", k.switch().name);
  void keypairSigner;
} else if (cmd === "config") {
  const keys = [
    xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingContractComputeV0() })),
    xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingContractLedgerCostV0() })),
    xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingStateArchival() })),
    xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId.configSettingContractLedgerCostExtV0() })),
  ];
  const r = await server.getLedgerEntries(...keys);
  for (const e of r.entries) {
    const cs: any = e.val.configSetting();
    const name = cs.switch().name;
    const body: any = cs.value();
    const out: Record<string, string> = {};
    for (const k of Object.keys(Object.getPrototypeOf(body)).filter((k) => typeof body[k] === "function" && k !== "toXDR")) {
      try {
        out[k] = String(body[k]());
      } catch {
        /* skip */
      }
    }
    console.log(name, JSON.stringify(out));
  }
}
process.exit(0);
