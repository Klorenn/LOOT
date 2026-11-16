import { xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

/**
 * Protocol 30 regression. This ledger header (testnet ledger 5766093, protocolVersion 30) was
 * captured from the live testnet RPC (getLatestLedger -> headerXdr).
 *
 * @stellar/stellar-sdk 16.3.0 cannot decode it: rpc.Server.getLatestLedger() ->
 * parseRawLatestLedger() throws "XDR Read Error: unknown StellarValueType member for value 3".
 * Anything that decodes P30 ledger data (getLatestLedger, getLedgers, ...) goes through this decoder.
 */
const P30_HEADER_XDR =
  "AAAAHsMQbRw2OGfWfluZZLt22ACAQwUz7bR9fDA2nNI7NNCuBVi9tNiM9HhKKHrRb3ilhs9J3qJf9hcnVduFGQF7IqUAAAAAavtM3gAAAAAAAAADAAABoeWkRw8AAAAAtV0Qsrt9KE7VwDpHpeG1kMkPV4NVRxzEUHu+ggTSPIsAAABAIg8TmS+/qIttQ9UynUFhxbUEyOUt+PewOWTJOGY93UuRHp7X9/eazz0E0lf0JZeINbtTRS9EKodeY0mZVKPkAB8Z3qrObcCObKxzKSiScCmCIiFr1/KBOnDxlJq9IU2b8dV1HmEDxqYbG2CbiiY/TUD3GxoCf8excwz7VgGdeUcAV/vNDeC2s6dkAAAAAC0zNfFMHgAAAAAAAAAAAA7ypwAAAGQATEtAAAAAyNhllBxcYclnlbDt7D3yfo74MwETz3tb+o/xNGZYupVRdn5y9LxwptgVd7z83bjoaUunaW79ftkgglEfZ24X738hUR8+RPG78t5V2Z/KN5UZ1yhjYCbU/IPTmD1wlg2Q/0TAaAz0AcKXg+0YuEt37ZCofX9OhI4/zMdPViWaDD1oAAAAAA==";

describe("Protocol 30 XDR", () => {
  it("decodes a P30 ledger header (StellarValueType 3)", () => {
    const header = xdr.LedgerHeader.fromXDR(P30_HEADER_XDR, "base64");
    expect(header.ledgerSeq()).toBe(5766093);
    expect(header.ledgerVersion()).toBe(30);
  });
});
