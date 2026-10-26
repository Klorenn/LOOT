import { afterEach, describe, expect, it, vi } from "vitest";
import { MAINNET_PASSKEY_NOTE, MAINNET_PASSKEY_SIGNOUT } from "./passkey-policy";

describe("mainnet passkey policy copy", () => {
  it("tells people which wallets to use and that passkeys are testnet-only", () => {
    for (const t of [MAINNET_PASSKEY_NOTE, MAINNET_PASSKEY_SIGNOUT]) {
      expect(t).toMatch(/Freighter, xBull, LOBSTR/);
      expect(t).toMatch(/testnet-only/);
    }
  });
});

describe("wallet kit phone detection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects phones by user agent and keeps WalletConnect off without a project id", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    const { isPhone, wcEnabled } = await import("./wallets-kit");
    expect(isPhone()).toBe(true);
    // sin NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID la opción móvil no existe
    expect(wcEnabled()).toBe(false);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/120" });
    expect(isPhone()).toBe(false);
  });
});

describe("wallet kit helpers", () => {
  it("offers WalletConnect on any device/network once a project id exists, and reads kit error objects", async () => {
    vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "abc123");
    vi.resetModules();
    const { wcEnabled, WC_PROJECT_ID, walletErrorMessage } = await import("./wallets-kit");
    expect(WC_PROJECT_ID).toBe("abc123");
    expect(wcEnabled()).toBe(true);
    expect(walletErrorMessage({ code: -1, message: "The user closed the modal." })).toBe("The user closed the modal.");
    expect(walletErrorMessage(new Error("boom"))).toBe("boom");
    expect(walletErrorMessage(undefined)).toBe("");
    vi.unstubAllEnvs();
  });
});
