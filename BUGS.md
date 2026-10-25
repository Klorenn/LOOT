# Known bugs / gaps at MVP freeze

Priority for post-freeze (only fix if demo breaks):

1. **Claim CLI hang** — `stellar contract invoke --send=yes` sometimes stalls >3min after simulation; API `/api/claim` preferred for UI.
2. **Passkey** — Face ID is a gate; signing is still a local keypair in `localStorage`.
3. **Relayer** — no OZ Docker; `RELAYER_SECRET` signs claims server-side.
4. **Panel** — no on-chain close / withdraw UI yet.
5. **Attack normal side** — theatrical simulation only.
6. **CI** — not configured.
7. **Home metrics** — hardcoded.

Won’t fix before form submit unless judges can’t open `/chest/2`.
