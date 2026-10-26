import { describe, expect, it } from "vitest";
import { otherNetworkUrl } from "./network-switch";

describe("otherNetworkUrl", () => {
  it("keeps path and query", () => {
    expect(otherNetworkUrl("https://mainnet.findloot.xyz", "/chest/abc", "?next=%2Fcreate&x=1")).toBe(
      "https://mainnet.findloot.xyz/chest/abc?next=%2Fcreate&x=1",
    );
  });
  it("trims trailing slashes and handles root/empty query", () => {
    expect(otherNetworkUrl("https://www.findloot.xyz/", "/", "")).toBe("https://www.findloot.xyz/");
    expect(otherNetworkUrl("https://www.findloot.xyz//", "/explore", "?")).toBe("https://www.findloot.xyz/explore");
  });
});
