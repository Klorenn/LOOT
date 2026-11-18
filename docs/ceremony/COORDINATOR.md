# Coordinator runbook (multi-party ceremony, Nov 2026)

Issue: https://github.com/Klorenn/LOOT/issues/4 · Scripts: `scripts/ceremony/` · Files: `circuits/ceremony/multiparty-2026-12/`

Needs Node 18+, `fd`, `rg`, `unzip`, `python3`. The ptau (~5 MB) is cached in `~/.cache/loot-ceremony`.

| When (UTC) | Do |
|---|---|
| 20-11 | Registration closes. |
| 21-11 | Post the ordered list on the issue (Pau last). |
| 22-11 00:00 | `bash scripts/ceremony/next-turn.sh 0 "" "" "<name>" "<handle>"` → send the message to contributor 1. |
| Each time someone posts | Copy the zip link from their comment and run `bash scripts/ceremony/next-turn.sh <N> "<zip link>" "<sha256 they posted>" "<next name>" "<next handle>"`. It checks the sha256, runs `zkey verify` (must list N contributions), stores the file, logs it in `SHA256SUMS` and `TRANSCRIPT.md`, and prints the message for N+1. If anything fails it stops: reply on the issue and ask them to redo it. |
| Silent for 24 h | Skip them: send the last printed message again, with the next person's name and a new 24 h deadline. |
| Before 29-11 00:00 | Pau contributes last with the same steps (manual or agent prompt), posts on the issue, then accepts it with `next-turn.sh`. |
| ≥ 30-11 12:00 | `bash scripts/ceremony/finalize.sh` → `chest_final.zkey`, `verification_key.json`, `BEACON.md`. It refuses to run until drand round 6685526 and Stellar ledger 65750791 exist and two Horizon servers agree. |
| After finalize | Commit the folder, post the final sha256s on the issue, rebuild the verifier with the new vk, deploy to mainnet. |

Gate: at least 3 contributors outside Loot and Tellus Cooperative before finalizing.
