declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    F: { toObject: (x: unknown) => bigint };
    (inputs: unknown[]): unknown;
  }>;
}
