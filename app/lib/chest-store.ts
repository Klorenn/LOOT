import { promises as fs } from "fs";
import path from "path";

export type ChestMeta = {
  id: number;
  template: string;
  question: string;
  hint?: string;
  /** Público: hace falta para armar la prueba. El secreto es la respuesta. */
  salt: string;
  fingerprintHex: string;
  prize: number;
  maxClaims: number;
  createdAt: string;
};

const FILE = path.join(process.cwd(), "data", "chests.json");

async function readAll(): Promise<Record<string, ChestMeta>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, ChestMeta>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function saveChestMeta(meta: ChestMeta) {
  const all = await readAll();
  all[String(meta.id)] = meta;
  await writeAll(all);
}

export async function getChestMeta(id: number): Promise<ChestMeta | null> {
  const all = await readAll();
  return all[String(id)] ?? null;
}

export async function listChests(): Promise<ChestMeta[]> {
  const all = await readAll();
  return Object.values(all).sort((a, b) => b.id - a.id);
}
