/**
 * Prints rent-related network config and the implied persistent rent per KB.
 *   npx tsx scripts/rentconfig.ts [rpcUrl]
 * Rent formula (protocol 23+, rs-soroban-env fees.rs):
 *   write_fee_per_1kb = f(live_state_size)    (low..high interpolation below target, growth above)
 *   rent(entry) = ceil(size_bytes * write_fee_per_1kb * ledgers / (1024 * persistentRentRateDenominator))
 */
import { rpc, xdr } from "@stellar/stellar-sdk";

const url = process.argv[2] ?? "https://soroban-testnet.stellar.org";
const server = new rpc.Server(url);
const id = (f: xdr.ConfigSettingId) =>
  xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: f }));
const r = await server.getLedgerEntries(
  id(xdr.ConfigSettingId.configSettingContractLedgerCostV0()),
  id(xdr.ConfigSettingId.configSettingStateArchival()),
  id(xdr.ConfigSettingId.configSettingLiveSorobanStateSizeWindow()),
);
let cost: any, arch: any, win: bigint[] = [];
for (const e of r.entries) {
  const cs: any = e.val.configSetting();
  const n = cs.switch().name;
  if (n === "configSettingContractLedgerCostV0") cost = cs.contractLedgerCost();
  if (n === "configSettingStateArchival") arch = cs.stateArchivalSettings();
  if (n === "configSettingLiveSorobanStateSizeWindow") win = cs.liveSorobanStateSizeWindow().map((x: any) => BigInt(x.toString()));
}
const low = BigInt(cost.rentFee1KbSorobanStateSizeLow().toString());
const high = BigInt(cost.rentFee1KbSorobanStateSizeHigh().toString());
const target = BigInt(cost.sorobanStateTargetSizeBytes().toString());
const growth = BigInt(cost.sorobanStateRentFeeGrowthFactor().toString());
const denom = BigInt(arch.persistentRentRateDenominator().toString());
const minTtl = BigInt(arch.minPersistentTtl().toString());
const size = win.length ? win[win.length - 1] : 0n;
console.log(url);
console.log({ low, high, target, growth, denom, minTtl, liveStateBytes: size, windowSamples: win.length });
// rs-soroban-env: compute_rent_write_fee_per_1kb
let fee: bigint;
if (size <= target) fee = low + ((high - low) * size) / target;
else fee = high + ((size - target) * growth) / target; // approximate (growth scaled by 1e0 here)
if (fee < 1000n) fee = 1000n;
console.log("write_fee_per_1kb (stroops) ~", fee);
const rent = (bytes: number, ledgers: bigint) =>
  (BigInt(bytes) * fee * ledgers + 1024n * denom - 1n) / (1024n * denom);
console.log("rent for 1000 B over min TTL (7d):", Number(rent(1000, minTtl)) / 1e7, "XLM");
process.exit(0);
