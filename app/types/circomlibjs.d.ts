declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    (inputs: (bigint | number | string)[]): unknown;
    F: { toObject: (x: unknown) => bigint };
  }>;
}
