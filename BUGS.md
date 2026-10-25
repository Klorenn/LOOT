# Known bugs / gaps at MVP freeze

Priority for post-freeze (only fix if demo breaks):

1. **Claim CLI hang** — prefer `/api/claim` over `stellar … --send=yes`.
2. **Passkey** — ✅ passkey-kit smart wallet (C…); classic G… fallback if WebAuthn/deploy fails.
3. **Relayer** — ✅ OZ Channels via `RELAYER_API_KEY` (no Docker); fee-bump fallback with `RELAYER_SECRET`. Claim still signed by RELAYER_SECRET.
4. **Panel close** — ✅ `/api/chests/:id/close`.
5. **Attack normal side** — theatrical simulation only.
6. **CI** — ✅ `.github/workflows/ci.yml` (app build + cargo test).
7. **Home metrics** — still hardcoded.

Won’t fix before form submit unless judges can’t open `/chest/2`.
