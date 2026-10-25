# loot

SDK for [Loot](https://github.com/Klorenn/LOOT): one contract per puzzle chest on Stellar (testnet), prize in native XLM, claims proven with Groth16 (BN254) and sealed to the solver's address.

Lives in `packages/sdk` (the repo's existing location).

```ts
import { createChest, quoteCreate, claim, close, getChest, listChests, keypairSigner } from "loot";

const creator = keypairSigner("S...creator secret");

// Podium: 1st place 0.5 XLM, 2nd 0.3, 3rd 0.2. (Equal prizes: amountPerSlotXlm: 2, slots: 3.)
const spec = { question: "Capital of Portugal?", answer: "Lisboa", prizesXlm: [0.5, 0.3, 0.2], durationDays: 3 };
const q = await quoteCreate({ ...spec, creator: creator.publicKey });
// q.places = [{place:1,amountXlm:"0.5"}, ...], q.prizeXlm, q.creationFeeXlm (5), q.feeReserveXlm (exact), q.networkEstimateXlm

const { chestAddress } = await createChest({ ...spec, signer: creator });
const { txHash } = await claim({ chestAddress, answer: "lisboa", recipient: "G... or C...", signer: feePayer });
const chest = await getChest(chestAddress); // chest.prizesXlm, chest.nextPlace = { place: 2, amountXlm: "0.3" }
console.log(chest.nextPlace, (await listChests()).length);
await close({ chestAddress, signer: creator }); // unpaid places + unused fee reserve back to the creator
```

## Model

- `Chest` contract per chest; `ChestFactory.create_chest` deploys, initializes and funds it (the factory never holds funds).
- **Places are claim order.** The prize schedule is `prizes[0..n]` (1 to 50 places, every amount > 0). The 1st valid claim gets `prizes[0]`, the 2nd gets `prizes[1]`, and so on. After the last place the chest is sold out. Equal prizes are the same thing with an expanded vector.
- Creator pays: the prizes (their sum is locked and untouchable by fees), a 5 XLM creation fee to the treasury, and a prepaid fee reserve (`sum(prizes) x 0.1%/day x days`, exact). Daily fees come only from the reserve; every place always receives exactly its amount. On close the creator gets the unpaid places plus the unused reserve.
- Answers are normalized (trim, lowercase, strip accents, remove all spaces) and hashed `Poseidon(answerField, salt)`. The factory has no salt parameter, so the salt is derived from the on-chain question (`saltFromQuestion`).
- The proof's `chestId` is the field of the chest contract address; `recipient` is the field of the winner address, so a copied proof cannot pay anyone else.
- **No Sybil resistance.** Nullifier = Poseidon(playerSecret, chestId), and the circuit does NOT bind `playerSecret` to the recipient. It only stops replaying the same proof. One person who knows the answer can take several places (1st, 2nd and 3rd) by using different secrets and recipients. Do not rely on a podium to spread prizes across different people. `claim` generates a random secret and returns it.
- Salt = sha256(question) is public, so the only secret is the answer: use a high-entropy answer. A short or common answer (a word, a number, a date) can be brute-forced from the on-chain fingerprint in seconds, and the prize taken.
- `Signer = { publicKey, signTransaction, submit? }`: use `keypairSigner` for a G account or provide `submit` to go through a relayer (OZ Channels). `claim` needs no signature from the recipient, so passkey (C...) recipients are paid via any fee-paying signer.
- Proof generation needs the circuit artifacts: browser `/zk/chest.wasm` + `/zk/chest_final.zkey`; Node `CHESTZK_ZK_DIR` (default `app/public/zk`) or the `circuit` option.
- On testnet, deploy rent depends on network state and has varied from tens of XLM to a few cents; `quoteCreate` shows the simulated figure.

Scripts: `npm test`, `npm run e2e` (podium: 3 claims from 3 recipients, then a refund on a second chest; uses `chestzk-e2e-*` stellar-cli identities).

MIT
