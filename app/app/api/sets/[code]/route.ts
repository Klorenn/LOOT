import { NextRequest, NextResponse } from "next/server";
import { decodeChestId, encodeChestId } from "@/lib/chest-code";
import { getChestMeta, getSetClaim, getSetHeader, getSetMembers } from "@/lib/chest-store";
import { readChest } from "@/lib/chain";
import { cfg } from "@/lib/cfg";
import { testnetFeatures } from "@/lib/testnet-features";
import { statusOf, type ChestStatus } from "@/lib/listing";
import { stroopsToXlm, tokenDecimals, tokenLabel } from "@/lib/config";

/**
 * A chest set: header + one entry per question that was created. Never returns salts (private sets carry
 * them in the link fragment). `?account=G…` adds `claimedChestId`: the chest this account already took in
 * the set, if any. That "one per account" rule is enforced by this app's relayer only (off-chain).
 */
export type SetMemberView = {
  index: number;
  chestId: number;
  code: string;
  question: string;
  hint?: string;
  difficulty?: 1 | 2 | 3 | 4;
  status: ChestStatus | "unknown";
  prizeLabel: string | null;
  deadline: number | null;
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  if (!testnetFeatures(await cfg())) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { code } = await ctx.params;
  const setId = decodeChestId(code);
  if (setId === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  const header = await getSetHeader(setId);
  if (!header) return NextResponse.json({ error: "not found" }, { status: 404 });

  const members = await getSetMembers(setId, header.size);
  const views: SetMemberView[] = await Promise.all(
    [...members].map(async ([index, chestId]): Promise<SetMemberView> => {
      const [meta, chain] = await Promise.all([getChestMeta(chestId).catch(() => null), readChest(chestId).catch(() => null)]);
      return {
        index,
        chestId,
        code: encodeChestId(chestId),
        question: meta?.question ?? "—",
        hint: meta?.hint,
        difficulty: meta?.difficulty,
        status: chain ? statusOf(chain) : "unknown",
        prizeLabel: chain ? `${stroopsToXlm(chain.prize, tokenDecimals(chain.token))} ${tokenLabel(chain.token)}` : null,
        deadline: chain ? chain.deadline : null,
      };
    }),
  );
  views.sort((a, b) => a.index - b.index);

  const account = req.nextUrl.searchParams.get("account");
  const claimedChestId = account && /^[GC][A-Z2-7]{55}$/.test(account) ? await getSetClaim(setId, account).catch(() => null) : null;

  return NextResponse.json({
    id: setId,
    code,
    title: header.title,
    creator: header.creator,
    size: header.size,
    listed: header.listed,
    members: views,
    claimedChestId,
  });
}
