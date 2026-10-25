# Security scanning (Kuyfi)

ChestZK contracts are **scanned with Kuyfi**, a black-box Soroban scanner
(v0.1.0, MIT, https://github.com/alex0tico/kuyfi). This is **not an audit**: Kuyfi's
own docs say it does not replace a code audit, and its findings are signals for
manual review. Wording everywhere (UI, README, pitch): "scanned with Kuyfi".

Kuyfi has two parts:

- **OSINT Scanner**: reads the deployed WASM and maps functions/types. Read-only.
- **Chaos Monkey**: type-driven fuzzing (bounds, auth, call order, fees, liquidity).
  It **sends testnet transactions** to the target.

## How to scan

```bash
npm install -g @kuyfi/kuyfi            # once (Node 20+)

scripts/kuyfi-scan.sh <CONTRACT_ID>            # OSINT only, read-only
scripts/kuyfi-scan.sh <CONTRACT_ID> --chaos    # OSINT + Chaos Monkey (testnet tx)
scripts/kuyfi-scan.sh --all                                 # OSINT every id in app/lib/config.ts (rescan after config changes)
scripts/kuyfi-scan.sh --import <report.json> [report.pdf]   # publish a run you already did
```

`--chaos` refuses any contract id referenced in `app/lib/config.ts` (the live demo
contracts hold funds). Fuzz a **throwaway deployment** of the same WASM instead;
`KUYFI_ALLOW_LIVE=1` overrides the guard and should not be used.

### What Kuyfi v0.1.0 can and cannot do (read from the source, not assumed)

| Question | Answer | Evidence in the Kuyfi repo |
| --- | --- | --- |
| Non-interactive mode | Yes: `kuyfi <ID> [--json] [--pdf]` | `source/cli.tsx`, `source/modules/cli_runtime.ts` |
| Network flag | No. Testnet only (`soroban-testnet.stellar.org`) | `source/modules/network.ts` |
| OSINT-only flag | No. The CLI always runs Chaos Monkey after the scan | `source/modules/audit.ts` (`runAudit` = `scanContract` then `runChaosMonkey`) |
| Source account for Chaos Monkey | Not configurable. A random keypair is generated and funded by Friendbot on every run; a `stellar keys` identity is not used | `source/modules/chaos_monkey/keypair_factory.ts` |
| Report location | Current directory, `kuyfi-report-<reportId>.json/.pdf`; never overwrites | `source/modules/report_export.ts` |
| Exit code | `1` = tool failure, `0` = run finished (even with findings) | `cli_runtime.ts` |

Consequences: OSINT-only goes through `scripts/kuyfi-osint.mjs`, which imports the
scanner module from the globally installed package (same code as the TUI Scanner).
No `kuyfi-fuzzer` identity exists, so the "dedicated funded identity" is the
ephemeral Friendbot key Kuyfi creates itself.

### Excluded contracts

Stellar Asset Contracts (SACs: native XLM, USDC, the CHEST test token) are built into
the protocol, have no WASM, and are not our code. The OSINT script detects them
generically (contract executable type `contractExecutableStellarAsset`, via
`getLedgerEntries`), prints `excluded (Stellar built-in asset contract, not ours)`
and exits 3; `--all` treats that as success, not a failure. Nothing is written, so the
badge shows "Not scanned yet" for them; do not render it for tokens.

### Report files

| File | Meaning |
| --- | --- |
| `security/kuyfi/<id>.json` (+ `.pdf`) | Full Kuyfi `SecurityReport` (OSINT + Chaos Monkey). Severities in `summary.bySeverity` |
| `security/kuyfi/<id>.osint.json` | OSINT surface map only. **No `summary`/`findings`**: it says nothing about vulnerabilities |
| `app/public/security/kuyfi/*` | Copies written by the script. This is what the app reads (`app/lib/kuyfi.ts`) and serves |

A Chaos Monkey report takes precedence over an OSINT one for the same contract, and
an OSINT run never overwrites a Chaos Monkey report. The badge shows counts only
from a Chaos Monkey report; for OSINT-only contracts it shows "functions mapped,
fuzzing pending", never "0 findings".

`audits/` holds the raw first runs. The two current ones (chest, verifier) were
imported into `security/kuyfi/` with `--import`.

## Per-new-chest scan step

Every contract the factory deploys must be scanned on creation. In practice:

1. Deploy the chest, note its contract id.
2. `scripts/kuyfi-scan.sh <CHEST_ID>` right away (OSINT, read-only): the badge shows
   "mapped, fuzzing pending" instead of nothing.
3. Chaos Monkey does **not** run against a chest that holds funds. The factory
   deploys the same scanned WASM, so fuzz one throwaway chest per WASM hash
   (`--chaos`) and re-run when the WASM changes. Chests with the same hash share
   that result; say so in the UI instead of implying each chest was fuzzed.
4. Commit `security/kuyfi/` and `app/public/security/kuyfi/` so the deploy ships them.

Pending until the factory exists: the throwaway deployment for `--chaos` on the
normal chest and on factory-made chests.

## Manual triage of HIGH / CRITICAL signals

How Kuyfi assigns them (`source/modules/chaos_monkey/result_parser.ts`,
`signalToSeverity`): only `POTENTIAL_VULN` becomes HIGH, or CRITICAL when the
function looks like an admin function. `POTENTIAL_VULN` means a call made with an
unauthorized or unverified `Address` argument was **not rejected**
(`UNAUTHORIZED_CALL`, `UNAUTHORIZED_ADDR_CALL`, `REINIT_ATTACK`, `SELF_CALL_ATTACK`).
`UNCONTROLLED_PANIC` / `UNEXPECTED_ERROR` are MEDIUM.

Every HIGH/CRITICAL must be closed in this table, with a reason taken from the contract
source in `contracts/`, before the contract is shown as scanned clean.

### Closed

| Id | Contract | Function / vector | Verdict | Reasoning |
| --- | --- | --- | --- | --- |
| KYF-001 | first chest `CC6Q4V6Q...U4YOT` (superseded) | `recipient_field` / `UNAUTHORIZED_ADDR_CALL`, HIGH (`audits/kuyfi-report-kyf-20261025T114353Z-f5ab2e63.json`) | Fix | Public helper exposed as an entrypoint with an `Address` arg and no auth. It only computes `sha256(xdr(Address))`, so no funds at risk, but it widened the surface for no reason. Now `pub(crate) field_from_address` (`contracts/chest/src/lib.rs`, "No es entrypoint"). Commit 7584a5f. Re-scan of the redeployed chest `CCOIK76O...PGBHYZ`: 0 findings (`security/kuyfi/CCOIK76OU7VHRK5PCE3RKQUDO6C6I7YMBHM3G24FVMZJ2I2ZESBGPHYZ.json`) |

### Open: none from a real scan

Current Chaos Monkey reports have 0 findings (chest and verifier). That is a
statement about the vectors Kuyfi generated, not proof of absence of bugs.

### Pre-registered expectations (predictions, NOT findings)

Decided now so a future flag is not argued away after the fact. If Chaos Monkey flags
these, re-check the reasoning against the code before accepting it.

| Contract / function | If flagged as | Expected verdict | Reasoning |
| --- | --- | --- | --- |
| `chest.claim`, `normal-chest.claim` (`recipient: Address`, no `recipient.require_auth()`) | POTENTIAL_VULN / HIGH | False positive, by design | Authorization is knowledge of the answer, not the recipient's signature. ZK chest: the proof's public inputs bind `recipient` (`field_from_address`), so a relayer cannot redirect funds. Normal chest: the answer is in clear by design (attack demo), and funds go to `recipient`, not the caller. Re-check if `claim` ever pays anyone other than `recipient` |
| `init` on any contract (`admin.require_auth()` before the `has` check) | REINIT_ATTACK / HIGH | Fix if it ever fires | Re-init is blocked by `AlreadyInit` once set, so it should not fire. Residual risk is outside Kuyfi's reach: before the first `init`, whoever calls it first becomes admin. Deploy and `init` in the same script |
| `create_chest` (`creator.require_auth()`) | POTENTIAL_VULN / HIGH | False positive | `creator` must authorize and the transfer pulls from `creator`. A simulated call without auth fails with an auth error |
| `close_chest(chest_id)` | Auth vectors with a stranger as caller | Not expected to fire; verify the trace if it does | No `Address` argument: the creator is read from storage and `chest.creator.require_auth()` runs before any state change or transfer. Funds only go back to the creator. A call without the creator's auth must fail with an auth error in the trace |
| UNCONTROLLED_PANIC (MEDIUM) on i128 / u32 / u64 bounds | MEDIUM | Accept after reading the trace | Both contracts set `overflow-checks = true` in `[profile.release]`, so `claims += 1`, `id + 1` and `prize * (max_claims - claims)` panic instead of wrapping, and a panic reverts all state. `create_chest` uses `checked_mul` and returns `BadAmounts`. A MEDIUM here means "panics instead of returning an Error", not a fund-loss path; still confirm the function is not one that moves funds before the panic |

For every real flag: record the report id, the function, the vector name (it is in
`findings[].vectorName`), the transaction hash from `evidence.transaction.explorerUrl`,
and either the fix commit or the false-positive reasoning, in the "Closed" table.

## Known limitations of Kuyfi v0.1.0

- **No vectors for `__check_auth`** (custom-account / passkey smart wallets). Kuyfi
  lists it as `.` and sends it 0 vectors: the host invokes it with a signature payload
  and auth contexts that a black-box caller cannot build
  (`docs/technical-writeup.md` §8 in the Kuyfi repo). Anything about passkey
  authorization in ChestZK is **not covered** by a Kuyfi scan and needs manual review.
- Testnet only. Black-box: it sees types, not intent. A clean report does not mean
  the logic is right.
- Findings are signals for manual review; there is no proof of exploitability or of
  absence of bugs.
- The ZK circuit and the verifier's cryptography are out of scope for Kuyfi.
