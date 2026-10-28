# Relayer abuse controls and Vercel Firewall proposal

Status: the in-app limits below are implemented. The Vercel Firewall rules are a PROPOSAL and have not been applied to any project.

## What the app enforces

Two layers run on `POST /api/claim` and `POST /api/passkey/send`, on testnet and mainnet.

1. In-memory limiter (`lib/rate-limit.ts`): per instance, per IP and global per minute. Cheap first filter. It resets on cold start and is not shared between instances, so it is a speed bump, not a guarantee.
2. Persistent limiter (`lib/persistent-limit.ts`, `lib/relay-gate.ts`): counters in the same Vercel Blob store as chest metadata (`LOOT_READ_WRITE_TOKEN`). Shared by all instances and survives restarts.

Blob has no atomic increment, so each hit is a small marker object under a time-bucketed prefix (`relay/<net>/rl/...`). The limiter writes the marker, counts markers under the prefix, and deletes its own marker if the bucket is over the limit. Concurrent requests can only over-deny, never over-allow. Cost per checked request is one put and one list, plus one delete when denied. No KV is needed at the current volume. If sustained traffic makes the Blob operation count a cost problem, move the counters to Vercel KV / Upstash Redis (`INCR` with `EXPIRE`) behind the same `MarkerStore`-style seam.

IPs are stored only as a truncated salted SHA-256, never raw. Old buckets are never read again. Purge `relay/<net>/rl/` older than 2 days from the Blob dashboard or a cron if the object count matters.

### Counters and defaults

| Counter | Scope | Testnet | Mainnet | Env override |
| --- | --- | --- | --- | --- |
| Global requests per minute, `/api/claim` | persistent | 600 | 120 | `RELAY_PERSIST_CLAIM_GLOBAL_PER_MIN[_MAINNET]` |
| Global requests per minute, `/api/passkey/send` | persistent | 600 | 120 | `RELAY_PERSIST_PASSKEY_GLOBAL_PER_MIN[_MAINNET]` |
| Passkey wallet deploys per IP per day | persistent | 3 | 3 | `RELAY_DEPLOY_PER_IP_PER_DAY[_MAINNET]` |
| Passkey wallet deploys per day, all IPs | persistent | 50 | 60 | `RELAY_DEPLOY_GLOBAL_PER_DAY[_MAINNET]` |
| Requests per minute per IP (best effort) | in-memory | 60 | 10 | `RELAY_RATE_PER_IP_PER_MIN[_MAINNET]` |
| Mainnet lifetime sponsored registrations | persistent | none | 60 | `RELAY_MAX_REGISTRATIONS` |

The wallet-deploy counters are taken only for requests the policy check classifies as `wallet_deploy`, after the transaction was vetted, so malformed bodies do not burn quota. If a deploy fails before anything is sent, the slots are returned. A `tx_pending` outcome (maybe sent) keeps them.

### Fee caps per request (final transaction fee, resource plus inclusion)

| Kind | Testnet | Mainnet |
| --- | --- | --- |
| claim, create_chest, close_chest, transfer | 10 XLM (`RELAY_MAX_FEE_STROOPS`) | 0.3 XLM (`RELAY_MAX_FEE_STROOPS_MAINNET`) |
| claim on registry v2 (player-signed) | 0.5 XLM (`RELAY_MAX_CLAIM_V2_FEE_STROOPS`; measured resource fee 895,284 stroops) | n/a (v2 is testnet only) |
| wallet_deploy | 1 XLM (`RELAY_MAX_DEPLOY_FEE_STROOPS`) | 1 XLM (`RELAY_MAX_DEPLOY_FEE_STROOPS_MAINNET`) |

The testnet deploy cap is the measured cost plus margin: `app/scripts/measure-wallet-deploy.mjs` simulates the real shared-deployer deploy (secp256r1 signer + Genesis binding proof) and measured a resource fee of 3,434,759 stroops (0.343 XLM) on 2026-10-28; the cap is 1 XLM. An earlier observation of 4.29e9 stroops (about 429 XLM) came from a deploy that had to pay for the wallet wasm entry; if that happens again the deploy is refused with `fee_cap` instead of draining the relayer (extend the wasm TTL, or raise `RELAY_MAX_DEPLOY_FEE_STROOPS` on purpose). Mainnet never reads the testnet variables.

### Failure behavior

| Situation | Mainnet | Testnet |
| --- | --- | --- |
| Blob store unreachable or token missing during a limit check | Request denied, HTTP 503, code `rate_limit_unavailable` (fail closed) | Same: request denied, HTTP 503, `rate_limit_unavailable` (fail closed) |
| Registry verifier does not match `MAINNET_VERIFIER_ID` (once the registry exposes it) | HTTP 503, code `config_mismatch` | not checked |
| Verifier getter missing or RPC error while checking | not blocked (a proven mismatch is the only blocker) | not checked |
| Relayer balance unreadable | Request denied (existing behavior) | not blocked; counts as low for the alert |
| Relayer balance under `RELAYER_LOW_BALANCE_XLM` (testnet, default 500) / `RELAYER_LOW_BALANCE_XLM_MAINNET` (default 10) | `console.error` line tagged `[relayer-low-balance]` (JSON), plus a POST to `RELAYER_LOW_BALANCE_WEBHOOK` if set; responses unchanged | Same alert (after each paid claim and on `/api/relayer/status`); `/api/relayer/status` also returns `relayerLow` |

Denials never return internal error text. Codes: `rate_limited`, `deploy_limit`, `rate_limit_unavailable`, `config_mismatch`.

## Proposed Vercel Firewall rules (not applied)

Vercel Firewall runs before the function, is shared across all instances and regions, and does not cost a function invocation or a Blob operation. It is the right place for per-IP limits. Verify field names against the current Vercel docs before creating the rules; the dashboard path is Project, Firewall, Custom Rules.

### Rule 1: per-IP rate limit on relayed writes

- Name: `relay-writes-per-ip`
- Match: Request Path equals `/api/passkey/send` OR Request Path equals `/api/claim`, AND Method equals `POST`
- Rate limit: key = IP, window = 60 s, limit = 10 requests (mainnet traffic is one claim per person; testnet can use 30)
- Action when exceeded: Deny (429) for 10 minutes

### Rule 2: challenge on suspicious volume

- Name: `relay-writes-challenge`
- Match: Request Path equals `/api/passkey/send` AND Method equals `POST`, with a lower threshold than Rule 1 (more than 4 requests per 60 s per IP)
- Action: Challenge (managed JS challenge). Real browsers pass it transparently. A challenge only works for browser-originated calls; the SDK and scripts calling the API directly will fail it. Apply it only to the passkey signup path (browser-only) and keep Rule 1 as the hard limit for `/api/claim`.

### Rule 3: tighter limit for wallet deploys

- Name: `passkey-deploy-per-ip`
- Match: Request Path equals `/api/passkey/send` AND Method equals `POST`
- Rate limit: key = IP, window = 1 hour, limit = 6 requests
- Action: Deny for 1 hour

The app's own per-IP per-day deploy counter (3 on mainnet) is the authoritative cap; this rule only stops floods before they reach the function.

### Rule 4: block obvious scanners

- Name: `relay-bad-bots`
- Match: path starts with `/api/` AND (User-Agent is empty OR matches a known scanner list)
- Action: Challenge, or Deny if the traffic has no browser use case

### Rollout notes

1. Create the rules in "Log only" mode for 24 hours, check false positives (a conference room behind one IP is the main one: raise Rule 1 temporarily for events).
2. Switch to enforce. Keep the in-app limits: they are the backstop if a rule is edited or removed.
3. The app reads the client IP from `x-forwarded-for` / `x-real-ip`, which Vercel sets. Do not put another proxy in front without re-checking that.
4. After enabling, hit the endpoints from one IP above the limit and confirm 429 from the edge, not from the function.
