# Known bugs / gaps at MVP freeze

Priority for post-freeze (only fix if demo breaks):

1. **Claim CLI hang** — prefer `/api/claim` over `stellar … --send=yes`.
2. **Passkey** — ✅ passkey-kit C… deploy via `/api/passkey/send` local-channel (rebuild `{func,auth}` + fee-bump when rent > uint32). Classic G… only via explicit “Demo sin passkey”. Known kit bug: `connectWallet` crashes on null signer expiration — we skip connect after create / reuse stored player.
3. **Relayer** — ✅ OZ Channels if `RELAYER_API_KEY`; else local-channel with `RELAYER_SECRET`. Claim still signed by `RELAYER_SECRET`.
4. **Panel close** — ✅ `/api/chests/:id/close`.
5. **Attack normal side** — theatrical simulation only.
6. **CI** — ✅ `.github/workflows/ci.yml` (app build + cargo test).
7. **Home metrics** — still hardcoded.

Won’t fix before form submit unless judges can’t open `/chest/2`.
