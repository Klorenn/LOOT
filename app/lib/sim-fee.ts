/**
 * Fee de recursos de una AssembledTransaction ya simulada (stroops), o null si no hay simulación.
 * `simulationData.transactionData` es un xdr.SorobanTransactionData en SDK 16 (en otras versiones, un
 * SorobanDataBuilder con .build()): se aceptan ambos.
 */
export function resourceFeeOf(at: unknown): bigint | null {
  const td = (at as { simulationData?: { transactionData?: unknown } })?.simulationData?.transactionData as
    | { build?: () => unknown; resourceFee?: () => { toString(): string } }
    | undefined;
  if (!td) return null;
  const data = (typeof td.build === "function" ? td.build() : td) as { resourceFee?: () => { toString(): string } };
  return typeof data.resourceFee === "function" ? BigInt(data.resourceFee().toString()) : null;
}
