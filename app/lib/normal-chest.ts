import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

export type NormalChestOpts = {
  rpcUrl: string;
  passphrase: string;
  contractId: string;
  chestId: number;
  tokenId: string;
  /** Firma y paga fees de todo el flujo (jugador y bot no tienen fondos). */
  relayerSecret: string;
  /** Answer used by the legitimate player (the bot is NOT given it). */
  playerAnswer: string;
  log?: (msg: string) => void;
};

export type NormalChestResult = {
  playerTx: string;
  botTx: string;
  answerReadFromLedger: string;
  paidTo: string;
  player: string;
  botBalance: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitTx(server: rpc.Server, hash: string) {
  for (let i = 0; i < 40; i++) {
    const res = await server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return res;
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`tx ${hash} failed on the ledger`);
    }
    await sleep(1000);
  }
  throw new Error(`tx ${hash} was not confirmed in time`);
}

/** Firma, envía y espera confirmación. Reintenta si la secuencia colisionó. */
export async function submit(
  server: rpc.Server,
  kp: Keypair,
  build: (account: Awaited<ReturnType<rpc.Server["getAccount"]>>) => ReturnType<TransactionBuilder["build"]>,
  extraSigners: Keypair[] = [],
  soroban = true,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const account = await server.getAccount(kp.publicKey());
    let tx = build(account);
    // prepareTransaction lanza con el error del contrato (#N) si la simulación falla.
    if (soroban) tx = await server.prepareTransaction(tx);
    tx.sign(kp, ...extraSigners);
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      if (attempt < 2 && /txBadSeq/i.test(JSON.stringify(sent.errorResult ?? ""))) {
        await sleep(1500);
        continue;
      }
      throw new Error(`sendTransaction ERROR: ${sent.errorResult?.result().switch().name ?? "?"}`);
    }
    if (sent.status === "TRY_AGAIN_LATER" && attempt < 2) {
      await sleep(1500);
      continue;
    }
    if (sent.status === "TRY_AGAIN_LATER") throw new Error("RPC is overloaded (TRY_AGAIN_LATER)");
    await waitTx(server, sent.hash);
    return sent.hash;
  }
}

async function claim(
  server: rpc.Server,
  o: NormalChestOpts,
  relayer: Keypair,
  recipient: string,
  answer: string,
): Promise<string> {
  const contract = new Contract(o.contractId);
  return submit(server, relayer, (acc) =>
    new TransactionBuilder(acc, { fee: "1000000", networkPassphrase: o.passphrase })
      .addOperation(
        contract.call(
          "claim",
          nativeToScVal(o.chestId, { type: "u32" }),
          Address.fromString(recipient).toScVal(),
          nativeToScVal(answer, { type: "string" }),
        ),
      )
      .setTimeout(120)
      .build(),
  );
}

/** Lee la tx del ledger y extrae el argumento `answer` de `claim`. */
export async function readAnswerFromTx(
  server: rpc.Server,
  passphrase: string,
  contractId: string,
  hash: string,
): Promise<string> {
  const res = await server.getTransaction(hash);
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`tx ${hash} is not confirmed (${res.status})`);
  }
  const parsed = TransactionBuilder.fromXDR(res.envelopeXdr, passphrase);
  const tx = "innerTransaction" in parsed ? parsed.innerTransaction : parsed;
  const op = tx.operations[0];
  if (!op || op.type !== "invokeHostFunction") {
    throw new Error("the tx is not an invokeHostFunction");
  }
  if (op.func.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
    throw new Error("the tx does not invoke a contract");
  }
  const ic = op.func.invokeContract();
  if (Address.fromScAddress(ic.contractAddress()).toString() !== contractId) {
    throw new Error("the tx is not for the plain chest");
  }
  if (ic.functionName().toString() !== "claim") {
    throw new Error("the tx is not a claim");
  }
  return String(scValToNative(ic.args()[2]));
}

async function tokenBalance(server: rpc.Server, o: NormalChestOpts, who: string, source: Keypair) {
  const account = await server.getAccount(source.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: o.passphrase })
    .addOperation(new Contract(o.tokenId).call("balance", Address.fromString(who).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("could not read the bot's balance");
  }
  return String(scValToNative(sim.result.retval));
}

/**
 * Flujo determinista: el jugador cobra con la respuesta en claro; el bot la
 * LEE DEL LEDGER (no la conoce) y cobra con su propia cuenta.
 */
export async function runNormalChestFlow(o: NormalChestOpts): Promise<NormalChestResult> {
  const log = o.log ?? (() => {});
  const server = new rpc.Server(o.rpcUrl);
  const relayer = Keypair.fromSecret(o.relayerSecret);
  const player = Keypair.random();
  const bot = Keypair.random();

  // El premio es XLM nativo: las cuentas frescas no necesitan trustline.
  log("preparing fresh accounts (player and bot)…");
  await submit(
    server,
    relayer,
    (acc) => {
      const b = new TransactionBuilder(acc, { fee: "10000", networkPassphrase: o.passphrase });
      for (const kp of [player, bot]) {
        b.addOperation(Operation.createAccount({ destination: kp.publicKey(), startingBalance: "2" }));
      }
      return b.setTimeout(120).build();
    },
    [],
    false,
  );

  log(`player ${player.publicKey().slice(0, 8)}… claims with the plain-text answer`);
  const playerTx = await claim(server, o, relayer, player.publicKey(), o.playerAnswer);
  log(`player claimed → tx ${playerTx}`);

  const answerReadFromLedger = await readAnswerFromTx(server, o.passphrase, o.contractId, playerTx);
  log(`bot reads the tx from the ledger: answer '${answerReadFromLedger}'`);

  log(`bot ${bot.publicKey().slice(0, 8)}… claims from its own account`);
  const botTx = await claim(server, o, relayer, bot.publicKey(), answerReadFromLedger);
  const botBalance = await tokenBalance(server, o, bot.publicKey(), relayer);
  log(`bot claimed → tx ${botTx} · PAID (balance ${botBalance})`);

  return {
    playerTx,
    botTx,
    answerReadFromLedger,
    paidTo: bot.publicKey(),
    player: player.publicKey(),
    botBalance,
  };
}
