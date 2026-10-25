import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerToField,
  fingerprintAnswer,
  normalizeAnswer,
  saltFromQuestion,
  addressField,
  randomPlayerSecret,
  resolvePrizes,
  quoteCreate,
  xlmToStroops,
  stroopsToXlm,
} from "../src/index.js";

test("normalizeAnswer: trim, lowercase, strip accents, remove all spaces", () => {
  const variants = [
    "Mazières", // precomposed
    "mazieres",
    " MAZIERES ",
    "Mazières", // combining grave accent
    "Maz iè res",
  ];
  const fields = variants.map((v) => answerToField(normalizeAnswer(v)));
  for (const f of fields) assert.equal(f, fields[0]);
  assert.equal(normalizeAnswer(variants[0]), "mazieres");
});

test("same fingerprint for every spelling of the answer", async () => {
  const salt = saltFromQuestion("Which test question?");
  const fps = await Promise.all(
    ["Mazières", "mazieres", " MAZIERES ", "Mazières"].map(
      async (a) => (await fingerprintAnswer(a, salt)).fingerprintHex,
    ),
  );
  for (const f of fps) assert.equal(f, fps[0]);
});

test("numeric answers keep their numeric field value", () => {
  assert.equal(answerToField(normalizeAnswer(" 8 ")), 8n);
});

test("addressField: stable, in-field (byte 0 is 0)", () => {
  const a = addressField("GCTQ4VSCCWCOPBUCZF2RM5S6TFAM3GBXSS3MQG4OAF5PIMQU2GOSM323");
  assert.equal(a.hex.length, 64);
  assert.equal(a.hex.slice(0, 2), "00");
});

test("xlmToStroops rejects >7 decimals, exponent notation and signs", () => {
  for (const bad of ["1.00000001", "1e3", "1E-7", "-1", "+1", " 1", "1.", ".5", "0x10", 1e21]) {
    assert.throws(() => xlmToStroops(bad as string | number), /invalid XLM amount/, String(bad));
  }
  assert.equal(xlmToStroops("1.1234567"), 11_234_567n);
  assert.equal(xlmToStroops(2), 20_000_000n);
});

test("randomPlayerSecret is random and fits 248 bits", () => {
  const a = randomPlayerSecret();
  const b = randomPlayerSecret();
  assert.notEqual(a, b);
  assert.ok(a < 1n << 248n);
});

test("resolvePrizes: podium, equal expansion and validation", () => {
  assert.deepEqual(resolvePrizes({ prizesXlm: [50, 20, "10"] }), [500_000_000n, 200_000_000n, 100_000_000n]);
  assert.deepEqual(resolvePrizes({ amountPerSlotXlm: 2, slots: 3 }), [20_000_000n, 20_000_000n, 20_000_000n]);
  assert.throws(() => resolvePrizes({ prizesXlm: [] }), /between 1 and 50/);
  assert.throws(() => resolvePrizes({ prizesXlm: Array(51).fill(1) }), /between 1 and 50/);
  assert.throws(() => resolvePrizes({ prizesXlm: [1, 0] }), /> 0/);
  assert.throws(() => resolvePrizes({ prizesXlm: [1, -1] }), /invalid XLM amount/);
  assert.throws(() => resolvePrizes({ prizesXlm: [1], slots: 2, amountPerSlotXlm: 1 }), /not both/);
  assert.throws(() => resolvePrizes({}), /give prizesXlm/);
});

test("quoteCreate podium: per-place amounts, reserve on the sum", async () => {
  const q = await quoteCreate(
    { prizesXlm: [50, 20, 10], durationDays: 30 },
    { rpcUrl: "http://127.0.0.1:9" },
  );
  assert.deepEqual(q.places, [
    { place: 1, amountXlm: "50" },
    { place: 2, amountXlm: "20" },
    { place: 3, amountXlm: "10" },
  ]);
  assert.equal(q.prizeXlm, "80");
  assert.equal(q.feeReserveXlm, "2.4"); // 80 * 0.1% * 30
  assert.equal(q.creationFeeXlm, "5");
});

test("xlm <-> stroops", () => {
  assert.equal(xlmToStroops("0.018"), 180_000n);
  assert.equal(stroopsToXlm(60_180_000n), "6.018");
});

test("quoteCreate: exact reserve and total (offline fallback config)", async () => {
  // unreachable RPC -> falls back to default fee config and the fallback network estimate
  const q = await quoteCreate(
    { amountPerSlotXlm: 10, slots: 5, durationDays: 30 },
    { rpcUrl: "http://127.0.0.1:9" },
  );
  assert.equal(q.prizeXlm, "50");
  assert.equal(q.creationFeeXlm, "5");
  assert.equal(q.feeReserveXlm, "1.5"); // 50 * 0.1% * 30
  assert.equal(q.networkEstimateFromSimulation, false);
  assert.equal(q.totalXlm, "57");
});
