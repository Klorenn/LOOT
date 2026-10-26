# Wallets on phones

Wallet connection goes through `@creit.tech/stellar-wallets-kit` 2.7.1 (`app/lib/wallets-kit.ts`) with our own
picker (`app/components/wallet-picker.tsx`).

## WalletConnect setup (needed for wallet apps on phones)

1. Create a project at https://dashboard.reown.com (type: AppKit / WalletConnect).
2. Add `https://www.findloot.xyz` (and any preview domain you test on) to the project's allowed domains. The kit sends
   `metadata.url = https://www.findloot.xyz`.
3. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<project id>` in Vercel (Production + Preview).
4. **Redeploy.** `NEXT_PUBLIC_*` values are substituted into the client bundle at build time; changing the variable
   without a new build does nothing. The access in code is the literal `process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   (Next only inlines that exact form).

Without the variable: `console.warn` on kit load and a visible notice in the picker on phones. WalletConnect is
registered on desktop and phones, testnet and mainnet (`allowedChains` follows the configured network).

## What the picker shows on a phone

1. The wallet whose in-app browser opened the page (kit `isPlatformWrapper`, or the LOBSTR user agent): auto-selected.
2. "Wallet app" (WalletConnect) when the project id is set: LOBSTR, Freighter mobile, xBull...
3. Web wallets: xBull, Albedo, HOT.
4. A note + "Copy link" for Freighter/LOBSTR (extensions are never detected in a phone browser). Desktop-only
   extensions (OneKey, Bitget, Hana...) are hidden on phones.

## User gesture (popups)

xBull and Albedo call `window.open` inside `fetchAddress()`. iOS Safari blocks that after any `await`. The kit is
preloaded (picker open; idle on phones) into a module variable, and `connectGWalletSync(id)` calls
`setWallet` + `fetchAddress` with no `await` before them, directly from the click. With
`NEXT_PUBLIC_WALLET_MODAL=kit`, `authModalSync()` does the same for `kit.authModal()`.

## Real-device checklist

1. iPhone Safari: open the site, Connect, tap xBull. A new tab/window with xBull must open (no blocked-popup bar).
2. Same with Albedo, then HOT.
3. With the Reown env var deployed: tap "Wallet app". The Reown sheet opens; pick LOBSTR or Freighter; approve in the app; you return signed in.
4. Open the site inside the LOBSTR (or Freighter mobile) in-app browser: it should connect without tapping anything.
5. Android Chrome: repeat 1-3; confirm no OneKey/Bitget/Hana rows and that passkey (testnet) still registers.
