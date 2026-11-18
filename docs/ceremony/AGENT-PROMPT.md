# Contribute with an AI coding agent

Optional. You can run the steps by hand (they take ~5 minutes) or paste the prompt below into Claude Code, Codex, OpenCode or any agent that can run shell commands on your machine.

**Why the prompt is written this way:** anything an agent reads or prints is sent to its model provider. Your random input must never pass through the agent. The prompt makes the shell generate the randomness inside the command (`$(openssl rand -hex 64)`), so the agent only ever sees the command text, never the value, and snarkjs does not print it.

Fill in the values from the message you got when your turn started, then paste:

---

```text
You are helping me contribute to the Loot multi-party trusted setup ceremony
(Groth16 phase 2, snarkjs 0.7.6). Follow these steps exactly, on my machine,
in a new empty folder ./loot-ceremony. Stop and tell me if any check fails.
Do not improvise or "fix" a failed check.

My values:
- PREV_URL    = <link to the previous zkey or its .zip from my turn message>
- PREV_SHA256 = <sha256 of the previous zkey from my turn message>
- MY_HANDLE   = <my GitHub or X handle>
- PREV and ME = file names: PREV is the name in PREV_URL (for example chest_0003.zkey);
                ME is the next number (for example chest_0004.zkey)

Fixed values (do not change):
- R1CS_URL    = https://github.com/Klorenn/LOOT/raw/main/circuits/build/chest.r1cs
- R1CS_SHA256 = c7696685542f119b8b37e748a23b3556181048cb4dadcab7fceef797505403d2
- PTAU_URL    = https://circom.info/powersOfTau28_hez_final_12.ptau
- PTAU_SHA256 = dcf4ea473bf14b971ce5f7b7c1d6ce1c41a8ed042cdb75b65ca9178e3a3c7c17

SECURITY RULES (most important):
1. You must NEVER generate, see, print, store or repeat the random input.
   Do not write it to a file, a variable you echo, or your reply.
2. The only allowed way to pass randomness is the exact form below, where the
   shell expands it inside the command and nothing prints it:
   -e="$(openssl rand -hex 64)"
3. Do not run any command that would display that value (no `set -x`, no echo,
   no history dump).

Steps:
1. Check `node --version` is 18 or newer and `openssl` exists. If not, stop and tell me.
2. mkdir loot-ceremony && cd loot-ceremony. Download PREV_URL, R1CS_URL and PTAU_URL
   with curl -fL (keep the original file names). If PREV_URL is a .zip,
   unzip it: it must contain exactly one file named PREV (a .zkey).
3. Run `shasum -a 256` on PREV (the .zkey, not the zip), chest.r1cs and the ptau and compare with PREV_SHA256, R1CS_SHA256
   and PTAU_SHA256. All three must match exactly. If any differs, stop.
4. Verify the previous contribution:
   npx -y snarkjs@0.7.6 zkey verify chest.r1cs powersOfTau28_hez_final_12.ptau <PREV>
   The output must end with "ZKey Ok!". If not, stop.
5. Contribute (exactly this form, only replace the names):
   npx -y snarkjs@0.7.6 zkey contribute <PREV> <ME> --name="<MY_HANDLE>" -e="$(openssl rand -hex 64)"
   Copy the "Contribution Hash" that snarkjs prints (the multi-line hex block).
6. Verify my own output the same way as step 4, with <ME>. It must end with "ZKey Ok!"
   and list my name as the last contribution.
7. Run: shasum -a 256 <ME>   and   zip <ME without .zkey>.zip <ME>
8. Delete the downloaded ptau and r1cs (keep the zip and <ME>).
9. Do NOT post anything yourself. Give me, ready to paste into
   https://github.com/Klorenn/LOOT/issues/4 :
   - the path of the zip to attach,
   - the sha256 of <ME>,
   - the contribution hash,
   - this line: "I generated this contribution myself and deleted the random input."
```

---

**After the agent finishes:** post the comment on issue #4 yourself, from your own GitHub account, and attach the zip. If you signed up with X, post the sha256 and the contribution hash there too and link it in the comment.

The randomness only existed inside the snarkjs process and was gone when the command ended. Nothing else needs to be deleted.
